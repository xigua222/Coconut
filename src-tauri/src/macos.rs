//! Overlay 标题栏:WKWebView 会盖住系统红绿灯,把按钮容器提到 webview 之上。
//! AppKit 布局后会把按钮弹回默认位置,尺寸变化/前端就绪时再钉一次位置。
//!
//! 红绿灯默认按 22pt 原生标题栏居中(中心约在 y=11),比前端顶栏里的图标钮/标签
//! 高出一截。这里把标题栏容器拉到与前端顶栏等高再居中按钮,三者共用一条中线。
//! 容器保持透明(Overlay 样式),空白处 hitTest 落到 webview,不挡前端点击。

use objc2::encode::{Encode, Encoding};
use objc2::msg_send;
use objc2::runtime::AnyObject;
use tauri::WebviewWindow;

const LIGHTS_X: f64 = 16.0;
/// 与前端 --topbar-h 保持一致
const TITLEBAR_H: f64 = 38.0;

#[repr(C)]
#[derive(Clone, Copy)]
struct CGPoint {
    x: f64,
    y: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CGSize {
    width: f64,
    height: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CGRect {
    origin: CGPoint,
    size: CGSize,
}

unsafe impl Encode for CGPoint {
    const ENCODING: Encoding = Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
}

unsafe impl Encode for CGSize {
    const ENCODING: Encoding = Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
}

unsafe impl Encode for CGRect {
    const ENCODING: Encoding = Encoding::Struct("CGRect", &[CGPoint::ENCODING, CGSize::ENCODING]);
}

pub fn layout_traffic_lights(window: &WebviewWindow) {
    let Ok(ptr) = window.ns_window() else { return };
    let ns_window = ptr as *const AnyObject;
    if ns_window.is_null() {
        return;
    }

    unsafe {
        let ns_window = &*ns_window;
        let close: *const AnyObject = msg_send![ns_window, standardWindowButton: 0isize];
        let mini: *const AnyObject = msg_send![ns_window, standardWindowButton: 1isize];
        let zoom: *const AnyObject = msg_send![ns_window, standardWindowButton: 2isize];
        if close.is_null() || mini.is_null() || zoom.is_null() {
            return;
        }

        let cluster: *const AnyObject = msg_send![close, superview];
        if cluster.is_null() {
            return;
        }
        let container: *const AnyObject = msg_send![cluster, superview];
        if container.is_null() {
            return;
        }

        // 标题栏容器拉到顶栏高度并贴住窗口顶部;内部承载按钮的视图跟着铺满,
        // 这样按钮的居中基准就是前端顶栏本身。
        let win_frame: CGRect = msg_send![ns_window, frame];
        let mut container_frame: CGRect = msg_send![container, frame];
        container_frame.size.height = TITLEBAR_H;
        container_frame.origin.y = win_frame.size.height - TITLEBAR_H;
        let _: () = msg_send![container, setFrame: container_frame];

        let mut cluster_frame: CGRect = msg_send![cluster, frame];
        cluster_frame.origin.y = 0.0;
        cluster_frame.size.height = TITLEBAR_H;
        let _: () = msg_send![cluster, setFrame: cluster_frame];

        let close_frame: CGRect = msg_send![close, frame];
        let mini_frame: CGRect = msg_send![mini, frame];
        let gap = mini_frame.origin.x - close_frame.origin.x;
        let center_y = ((TITLEBAR_H - close_frame.size.height) / 2.0).round();

        for (i, btn) in [close, mini, zoom].iter().enumerate() {
            let mut frame: CGRect = msg_send![*btn, frame];
            frame.origin.x = LIGHTS_X + i as f64 * gap;
            frame.origin.y = center_y;
            let _: () = msg_send![*btn, setFrame: frame];
        }

        let cluster = &*cluster;
        let _: () = msg_send![cluster, setWantsLayer: true];
        let layer: *const AnyObject = msg_send![cluster, layer];
        if !layer.is_null() {
            let _: () = msg_send![&*layer, setZPosition: 1000.0f64];
        }
    }
}
