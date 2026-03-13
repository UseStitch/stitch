import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HotkeysProvider } from '@tanstack/react-hotkeys';
import { routeTree } from './routeTree.gen';
import './styles/global.css';

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
        <RouterProvider router={router} />
      </HotkeysProvider>
    </QueryClientProvider>
  </StrictMode>,
);
