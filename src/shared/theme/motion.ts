import type { Transition } from 'motion/react'

/*
 * 新版共用的動畫節奏：同一種動作在每個地方速度一樣，展開和關閉用同一條曲線。
 * 「減少動態」由 AppShell 的 <MotionConfig reducedMotion="user"> 統一處理（位移、縮放會關掉，只留淡入淡出）。
 */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const MOTION = {
  /** 選取、hover、標籤切換這種小回饋 */
  quick: { duration: 0.18, ease: EASE_OUT } satisfies Transition,
  /** 卡片換位、面板切換 */
  move: { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 } satisfies Transition,
  /** 共享元素展開／收回（卡片 ↔ 詳情） */
  expand: { type: 'spring', stiffness: 300, damping: 32 } satisfies Transition,
  /** 背景變暗 */
  scrim: { duration: 0.24, ease: EASE_OUT } satisfies Transition,
}
