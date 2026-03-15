import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { HotkeysProvider } from '@tanstack/react-hotkeys';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';

import { routeTree } from '@/routeTree.gen';
import { SseProvider } from '@/hooks/sse/sse-context';
import '@/styles/global.css';

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: { queryClient },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root')!;

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>
        <SseProvider>
          <RouterProvider router={router} />
        </SseProvider>
      </HotkeysProvider>
    </QueryClientProvider>
  </StrictMode>,
);
