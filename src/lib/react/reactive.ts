/**
 * 极简响应式 store:零依赖,组件用 React 内置 useSyncExternalStore 订阅。
 * - 类形态 store(TabStore 等)extends ReactiveStore,变更后调 this.notify();
 * - 模块级对象形态(findUI / agentActivity)用 createStore 单例。
 *
 * 设计原则:保持原有类/对象结构 1:1 平移,只把 Svelte runes 换成
 * "普通字段 + 显式 notify",方法签名与调用方零改动。
 */
import { useSyncExternalStore } from "react";

export class ReactiveStore {
  #listeners = new Set<() => void>();
  #version = 0;

  /** 供 useSyncExternalStore 使用(箭头属性,引用稳定) */
  subscribe = (cb: () => void): (() => void) => {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  };

  /** 快照:任何 notify 后版本号 +1,订阅组件重渲染。
   *  注意必须用箭头属性:传给 useSyncExternalStore 时不能丢失 this。 */
  getVersion = (): number => {
    return this.#version;
  };

  /** 状态变更后调用(子类 mutator 末尾;createStore 内部也会调) */
  notify(): void {
    this.#version++;
    for (const cb of this.#listeners) cb();
  }
}

export interface StoreHandle<T extends object> {
  /** 读取最新状态对象 */
  get(): T;
  /** 浅合并更新 */
  set(partial: Partial<T>): void;
  subscribe(cb: () => void): () => void;
  getVersion(): number;
}

/** 模块级对象 store(替代 Svelte 的模块级 $state 对象) */
export function createStore<T extends object>(initial: T): StoreHandle<T> {
  const base = new ReactiveStore();
  let state: T = { ...initial };
  return {
    get: () => state,
    set(partial: Partial<T>) {
      state = { ...state, ...partial };
      base.notify();
    },
    subscribe: base.subscribe,
    getVersion: base.getVersion,
  };
}

interface Subscribable {
  subscribe(cb: () => void): () => void;
  getVersion(): number;
}

/** 永不变化的空 store:无活动会话时订阅它,避免调用方写分支 */
const EMPTY: Subscribable = {
  subscribe: () => () => {},
  getVersion: () => 0,
};

/**
 * React 订阅 hook:store(或 session)变化时触发重渲染。
 * 用法:useStoreVersion(tabStore) 后直接读 store 字段(与 Svelte 裸访问等价);
 * 活动会话会变,把 session 也传进来一起订阅。
 * 传入 null 时不订阅(如无活动会话)。
 */
export function useStoreVersion(store: Subscribable | null): number {
  const s = store ?? EMPTY;
  return useSyncExternalStore(s.subscribe, s.getVersion);
}
