import type { RouteNode } from './route'
import type { LatLng } from './routeCache'

export type Leg = { i: number; from: RouteNode; to: RouteNode; mode: 'walk' | 'train'; label: string | null }

export const routeLegs = (nodes: RouteNode[]): Leg[] =>
  nodes.slice(1).map((to, i) => ({ i, from: nodes[i], to, mode: to.via === 'train' ? 'train' : 'walk', label: to.line }))

export const midpoint = (a: LatLng, b: LatLng): LatLng => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 })
