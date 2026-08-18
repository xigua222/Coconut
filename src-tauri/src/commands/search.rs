use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tantivy::collector::TopDocs;
use tantivy::query::{BooleanQuery, BoostQuery, Occur, Query, TermQuery};
use tantivy::schema::{
    Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions, Value, STRING, STORED,
};
use tantivy::tokenizer::{Token, TokenStream, Tokenizer};
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term};

use crate::commands::directory::markdown_files_under;
use crate::commands::file_io::{read_preview, take_chars, PREVIEW_CHARS};

const TOKENIZER: &str = "note";
const WRITER_HEAP: usize = 16_000_000;
const HIT_LIMIT: usize = 40;

#[derive(Clone)]
struct NoteTokenizer;

struct NoteTokenStream {
    tokens: Vec<Token>,
    i: isize,
}

impl Tokenizer for NoteTokenizer {
    type TokenStream<'a> = NoteTokenStream;

    fn token_stream<'a>(&'a mut self, text: &'a str) -> Self::TokenStream<'a> {
        NoteTokenStream {
            tokens: tokenize_note(text),
            i: -1,
        }
    }
}

impl TokenStream for NoteTokenStream {
    fn advance(&mut self) -> bool {
        self.i += 1;
        (self.i as usize) < self.tokens.len()
    }

    fn token(&self) -> &Token {
        &self.tokens[self.i as usize]
    }

    fn token_mut(&mut self) -> &mut Token {
        &mut self.tokens[self.i as usize]
    }
}

fn is_cjk(c: char) -> bool {
    matches!(
        c,
        '\u{3040}'..='\u{30FF}' | '\u{3400}'..='\u{9FFF}' | '\u{F900}'..='\u{FAFF}' | '\u{AC00}'..='\u{D7AF}'
    )
}

fn tokenize_note(text: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut pos = 0usize;
    let mut latin_from: Option<usize> = None;
    let mut cjk: Vec<(usize, usize)> = Vec::new();

    let emit = |tokens: &mut Vec<Token>, from: usize, to: usize, pos: &mut usize| {
        let mut token = Token::default();
        token.offset_from = from;
        token.offset_to = to;
        token.position = *pos;
        let mut piece = text[from..to].to_string();
        if piece.is_ascii() {
            piece.make_ascii_lowercase();
        }
        token.text = piece;
        tokens.push(token);
        *pos += 1;
    };

    let flush_latin = |tokens: &mut Vec<Token>, latin_from: &mut Option<usize>, end: usize, pos: &mut usize| {
        if let Some(from) = latin_from.take() {
            emit(tokens, from, end, pos);
        }
    };

    let flush_cjk = |tokens: &mut Vec<Token>, cjk: &mut Vec<(usize, usize)>, pos: &mut usize| {
        for i in 0..cjk.len() {
            emit(tokens, cjk[i].0, cjk[i].1, pos);
            if i + 1 < cjk.len() {
                emit(tokens, cjk[i].0, cjk[i + 1].1, pos);
            }
        }
        cjk.clear();
    };

    for (i, ch) in text.char_indices() {
        let next = i + ch.len_utf8();
        if is_cjk(ch) {
            flush_latin(&mut tokens, &mut latin_from, i, &mut pos);
            cjk.push((i, next));
        } else if ch.is_ascii_alphanumeric() || ch == '_' {
            flush_cjk(&mut tokens, &mut cjk, &mut pos);
            if latin_from.is_none() {
                latin_from = Some(i);
            }
        } else {
            flush_latin(&mut tokens, &mut latin_from, i, &mut pos);
            flush_cjk(&mut tokens, &mut cjk, &mut pos);
        }
    }
    flush_latin(&mut tokens, &mut latin_from, text.len(), &mut pos);
    flush_cjk(&mut tokens, &mut cjk, &mut pos);
    tokens
}

struct Fields {
    id: Field,
    title: Field,
    path: Field,
    body: Field,
    kind: Field,
}

pub struct SearchIndex {
    #[allow(dead_code)]
    index: Index,
    reader: IndexReader,
    writer: Mutex<IndexWriter>,
    tracked: Mutex<HashMap<String, u64>>,
    fields: Fields,
}

impl SearchIndex {
    pub fn new() -> tantivy::Result<Self> {
        let mut schema_builder = Schema::builder();
        let text = TextOptions::default()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer(TOKENIZER)
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            )
            .set_stored();
        let id = schema_builder.add_text_field("id", STRING | STORED);
        let title = schema_builder.add_text_field("title", text.clone());
        let path = schema_builder.add_text_field("path", text.clone());
        let body = schema_builder.add_text_field("body", text);
        let kind = schema_builder.add_text_field("kind", STRING | STORED);
        let schema = schema_builder.build();

        let index = Index::create_in_ram(schema);
        index.tokenizers().register(TOKENIZER, NoteTokenizer);
        let writer = index.writer_with_num_threads(1, WRITER_HEAP)?;
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()?;

        Ok(Self {
            index,
            reader,
            writer: Mutex::new(writer),
            tracked: Mutex::new(HashMap::new()),
            fields: Fields { id, title, path, body, kind },
        })
    }

    fn sync(&self, payload: SyncPayload) -> Result<(), String> {
        let mut keep = HashSet::new();
        let mut skip_disk = HashSet::new();
        let mut disk: HashMap<String, String> = HashMap::new();
        let mut live_docs = Vec::new();

        for live in payload.live_docs {
            let path = path_key(&live.path);
            let id = if path.is_empty() {
                live.id.clone()
            } else {
                skip_disk.insert(path.clone());
                path.clone()
            };
            keep.insert(id.clone());
            live_docs.push(LiveDoc {
                id,
                title: live.title,
                path,
                body: live.body,
                kind: "open".into(),
            });
        }
        for root in &payload.roots {
            for path in markdown_files_under(Path::new(root)) {
                let path = path_key(&path);
                if path.is_empty() || skip_disk.contains(&path) {
                    continue;
                }
                disk.entry(path).or_insert_with(|| "library".to_string());
            }
        }
        for extra in &payload.extra_files {
            let path = path_key(&extra.path);
            if path.is_empty() || skip_disk.contains(&path) {
                continue;
            }
            let kind = if extra.kind == "open" { "open" } else { "recent" };
            disk.entry(path).or_insert_with(|| kind.to_string());
        }
        for path in disk.keys() {
            keep.insert(path.clone());
        }

        let mut writer = self.writer.lock().map_err(|e| e.to_string())?;
        let mut tracked = self.tracked.lock().map_err(|e| e.to_string())?;
        let id_field = self.fields.id;

        for live in live_docs {
            let body = take_chars(&live.body, PREVIEW_CHARS);
            let stamp = live_stamp(&body) ^ 1; // 已打开标签每次覆盖,避免 kind 停在 recent
            writer.delete_term(Term::from_field_text(id_field, &live.id));
            writer
                .add_document(doc!(
                    self.fields.id => live.id.as_str(),
                    self.fields.title => live.title.as_str(),
                    self.fields.path => live.path.as_str(),
                    self.fields.body => body.as_str(),
                    self.fields.kind => live.kind.as_str(),
                ))
                .map_err(|e| e.to_string())?;
            tracked.insert(live.id, stamp);
        }

        for (path, kind) in disk {
            let Some((body, mtime)) = read_preview(Path::new(&path)) else {
                keep.remove(&path);
                if tracked.remove(&path).is_some() {
                    writer.delete_term(Term::from_field_text(id_field, &path));
                }
                continue;
            };
            if tracked.get(&path) == Some(&mtime) {
                continue;
            }
            let title = Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.clone());
            writer.delete_term(Term::from_field_text(id_field, &path));
            writer
                .add_document(doc!(
                    self.fields.id => path.as_str(),
                    self.fields.title => title.as_str(),
                    self.fields.path => path.as_str(),
                    self.fields.body => body.as_str(),
                    self.fields.kind => kind.as_str(),
                ))
                .map_err(|e| e.to_string())?;
            tracked.insert(path, mtime);
        }

        let stale: Vec<String> = tracked.keys().filter(|id| !keep.contains(*id)).cloned().collect();
        for id in stale {
            writer.delete_term(Term::from_field_text(id_field, &id));
            tracked.remove(&id);
        }

        writer.commit().map_err(|e| e.to_string())?;
        self.reader.reload().map_err(|e| e.to_string())?;
        Ok(())
    }

    fn search(&self, query: &str) -> Result<Vec<SearchHit>, String> {
        let q = query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let terms: Vec<String> = tokenize_note(q).into_iter().map(|t| t.text).collect();
        if terms.is_empty() {
            return Ok(Vec::new());
        }

        let mut clauses: Vec<(Occur, Box<dyn Query>)> = Vec::new();
        for term in &terms {
            let title = BoostQuery::new(term_query(self.fields.title, term), 6.0);
            let path = BoostQuery::new(term_query(self.fields.path, term), 2.0);
            let body = BoostQuery::new(term_query(self.fields.body, term), 1.0);
            let any = BooleanQuery::new(vec![
                (Occur::Should, Box::new(title) as Box<dyn Query>),
                (Occur::Should, Box::new(path) as Box<dyn Query>),
                (Occur::Should, Box::new(body) as Box<dyn Query>),
            ]);
            clauses.push((Occur::Must, Box::new(any)));
        }
        let parsed: Box<dyn Query> = if clauses.len() == 1 {
            clauses.pop().unwrap().1
        } else {
            Box::new(BooleanQuery::new(clauses))
        };

        let searcher = self.reader.searcher();
        let top = searcher
            .search(&parsed, &TopDocs::with_limit(HIT_LIMIT * 3))
            .map_err(|e| e.to_string())?;
        let mut hits = Vec::new();
        for (score, addr) in top {
            let doc: TantivyDocument = searcher.doc(addr).map_err(|e| e.to_string())?;
            let id = stored_str(&doc, self.fields.id);
            let title = stored_str(&doc, self.fields.title);
            let path = stored_str(&doc, self.fields.path);
            let kind = stored_str(&doc, self.fields.kind);
            let body = stored_str(&doc, self.fields.body);
            hits.push(SearchHit {
                id,
                title,
                path,
                kind,
                snippet: snippet_of(&body, q),
                score: score as f64,
            });
        }
        Ok(merge_hits(hits))
    }
}

fn path_key(p: &str) -> String {
    p.replace('\\', "/").trim_end_matches('/').to_string()
}

fn kind_rank(kind: &str) -> u8 {
    match kind {
        "open" => 0,
        "recent" => 1,
        _ => 2,
    }
}

fn hit_key(hit: &SearchHit) -> String {
    let path = path_key(&hit.path);
    if !path.is_empty() {
        path
    } else {
        hit.id.clone()
    }
}

fn merge_hits(hits: Vec<SearchHit>) -> Vec<SearchHit> {
    let mut best: HashMap<String, SearchHit> = HashMap::new();
    for hit in hits {
        let key = hit_key(&hit);
        match best.get(&key) {
            None => {
                best.insert(key, hit);
            }
            Some(old) => {
                let better = kind_rank(&hit.kind) < kind_rank(&old.kind)
                    || (kind_rank(&hit.kind) == kind_rank(&old.kind) && hit.score > old.score);
                if better {
                    best.insert(key, hit);
                }
            }
        }
    }
    let mut out: Vec<SearchHit> = best.into_values().collect();
    out.sort_by(|a, b| {
        kind_rank(&a.kind)
            .cmp(&kind_rank(&b.kind))
            .then(b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal))
            .then(a.title.cmp(&b.title))
            .then(a.path.cmp(&b.path))
    });
    out.truncate(HIT_LIMIT);
    out
}

fn term_query(field: Field, text: &str) -> Box<dyn Query> {
    Box::new(TermQuery::new(
        Term::from_field_text(field, text),
        IndexRecordOption::WithFreqs,
    ))
}

fn stored_str(doc: &TantivyDocument, field: Field) -> String {
    doc.get_first(field)
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default()
}

fn live_stamp(body: &str) -> u64 {
    let mut h = 0xcbf29ce484222325u64;
    for b in body.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h ^ (body.len() as u64)
}

fn snippet_of(body: &str, query: &str) -> String {
    let hay = body.split_whitespace().collect::<Vec<_>>().join(" ");
    let at = hay.to_lowercase().find(&query.to_lowercase());
    let Some(at) = at else {
        return hay.chars().take(88).collect();
    };
    let start = at.saturating_sub(24);
    let end = (at + query.len() + 48).min(hay.len());
    let start = floor_char(&hay, start);
    let end = ceil_char(&hay, end);
    let slice = hay[start..end].trim();
    format!(
        "{}{slice}{}",
        if start > 0 { "…" } else { "" },
        if end < hay.len() { "…" } else { "" }
    )
}

fn floor_char(s: &str, mut i: usize) -> usize {
    if i >= s.len() {
        return s.len();
    }
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn ceil_char(s: &str, mut i: usize) -> usize {
    if i >= s.len() {
        return s.len();
    }
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPayload {
    pub roots: Vec<String>,
    pub extra_files: Vec<ExtraFile>,
    pub live_docs: Vec<LiveDoc>,
}

#[derive(Deserialize)]
pub struct ExtraFile {
    pub path: String,
    pub kind: String,
}

#[derive(Deserialize)]
pub struct LiveDoc {
    pub id: String,
    pub title: String,
    pub path: String,
    pub body: String,
    pub kind: String,
}

#[derive(Serialize)]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    pub path: String,
    pub kind: String,
    pub snippet: String,
    pub score: f64,
}

#[tauri::command]
pub fn search_sync(index: tauri::State<SearchIndex>, payload: SyncPayload) -> Result<(), String> {
    index.sync(payload)
}

#[tauri::command]
pub fn search_query(index: tauri::State<SearchIndex>, query: String) -> Result<Vec<SearchHit>, String> {
    index.search(&query)
}

#[cfg(test)]
mod tests {
    use super::{merge_hits, tokenize_note, LiveDoc, SearchHit, SearchIndex, SyncPayload};

    #[test]
    fn cjk_bigram_includes_hainan() {
        let tokens: Vec<String> = tokenize_note("海南、邯郸").into_iter().map(|t| t.text).collect();
        assert!(tokens.iter().any(|t| t == "海南"));
    }

    #[test]
    fn indexes_live_markdown_and_finds_hainan() {
        let idx = SearchIndex::new().unwrap();
        idx.sync(SyncPayload {
            roots: vec![],
            extra_files: vec![],
            live_docs: vec![LiveDoc {
                id: "tab:1".into(),
                title: "数据要素".into(),
                path: String::new(),
                body: "2025年7月，海南、邯郸、浙江等地集中落地".into(),
                kind: "open".into(),
            }],
        })
        .unwrap();
        let hits = idx.search("海南").unwrap();
        assert_eq!(hits.first().map(|h| h.id.as_str()), Some("tab:1"));
        assert!(hits[0].snippet.contains("海南"));
    }

    #[test]
    fn merge_prefers_open_then_score() {
        let hits = merge_hits(vec![
            SearchHit {
                id: "dup".into(),
                title: "文档二.md".into(),
                path: "/x/文档二.md".into(),
                kind: "recent".into(),
                snippet: "m".into(),
                score: 3.0,
            },
            SearchHit {
                id: "/x/文档二.md".into(),
                title: "文档二.md".into(),
                path: "/x/文档二.md".into(),
                kind: "recent".into(),
                snippet: "m".into(),
                score: 9.0,
            },
            SearchHit {
                id: "tab:1".into(),
                title: "文档一.md".into(),
                path: "/x/文档一.md".into(),
                kind: "open".into(),
                snippet: "m".into(),
                score: 2.0,
            },
            SearchHit {
                id: "/x/文档一.md".into(),
                title: "文档一.md".into(),
                path: "/x/文档一.md".into(),
                kind: "recent".into(),
                snippet: "m".into(),
                score: 8.0,
            },
            SearchHit {
                id: "/y/笔记.md".into(),
                title: "笔记.md".into(),
                path: "/y/笔记.md".into(),
                kind: "library".into(),
                snippet: "m".into(),
                score: 5.0,
            },
        ]);
        assert_eq!(hits.iter().map(|h| h.title.as_str()).collect::<Vec<_>>(), ["文档一.md", "文档二.md", "笔记.md"]);
        assert_eq!(hits[0].kind, "open");
        assert_eq!(hits[1].score, 9.0);
    }
}
