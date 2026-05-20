import { createBrowserRouter } from "react-router-dom";
import { ROUTES } from "./routes.ts";

export const router = createBrowserRouter([
  {
    path: ROUTES.home,
    lazy: async () => {
      const { HomePage } = await import("../features/home/HomePage.tsx");
      return { Component: HomePage };
    },
  },
]);
