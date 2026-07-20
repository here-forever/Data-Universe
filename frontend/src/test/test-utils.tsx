import { QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { PropsWithChildren, ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import { createQueryClient } from "../app/queryClient";

interface TestProvidersProps extends PropsWithChildren {
  route?: string;
}

interface RenderWithProvidersOptions extends RenderOptions {
  route?: string;
}

function Providers({ children, route = "/" }: TestProvidersProps) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options?: RenderWithProvidersOptions,
) {
  const { route, ...renderOptions } = options ?? {};

  function Wrapper({ children }: PropsWithChildren) {
    return <Providers route={route}>{children}</Providers>;
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
