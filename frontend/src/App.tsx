import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { createQueryClient } from "./app/queryClient";
import { AppRoutes } from "./app/routes";

const queryClient = createQueryClient();

export function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
