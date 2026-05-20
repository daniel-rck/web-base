export const ROUTES = {
  home: "/",
} as const;

export type RouteKey = keyof typeof ROUTES;
