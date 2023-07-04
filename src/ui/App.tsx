import { Result } from 'antd';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useHotkeys } from 'react-hotkeys-hook';
import { boolean, pipe, task } from '@code-expert/prelude';
import { registerApp } from '@/application/registerApp';
import { globalSetupState } from '@/domain/Setup';
import { mkProjectRepositoryTauri } from '@/infrastructure/tauri/ProjectRepository';
import { GlobalContextProvider, useGlobalContextWithActions } from '@/ui/GlobalContext';
import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { GuardRemote } from '@/ui/components/GuardRemoteData';
import { TimeContextProvider, timeContext } from '@/ui/contexts/TimeContext';
import useNetworkState from '@/ui/hooks/useNetwork';
import { useRemote } from '@/ui/hooks/useRemoteData';
import { AppLayout } from '@/ui/layout';
import { Courses } from '@/ui/pages/courses';
import { Developer } from '@/ui/pages/developer';
import { Logout } from '@/ui/pages/logout';
import { Projects } from '@/ui/pages/projects';
import { Settings } from '@/ui/pages/settings';
import { Setup } from '@/ui/pages/setup';
import { Updater } from '@/ui/pages/update';
import { RouteContextProvider, routes, useRoute } from '@/ui/routes';

export const render = (container: HTMLElement): Promise<void> =>
  pipe(
    mkProjectRepositoryTauri(),
    task.map((projectRepository) => {
      const root = createRoot(container);
      root.render(
        <React.StrictMode>
          <ErrorBoundary>
            <GlobalContextProvider projectRepository={projectRepository}>
              <RouteContextProvider>
                <TimeContextProvider value={timeContext}>
                  <App />
                </TimeContextProvider>
              </RouteContextProvider>
            </GlobalContextProvider>
          </ErrorBoundary>
        </React.StrictMode>,
      );
    }),
    task.run,
  );

export function App() {
  const { online } = useNetworkState();
  const [{ setupState }] = useGlobalContextWithActions();
  const { currentRoute, navigateTo } = useRoute();
  const [clientIdRD, refreshClientId] = useRemote(registerApp);

  useHotkeys('ctrl+c+x', () => {
    navigateTo(routes.developer());
  });

  useEffect(() => {
    refreshClientId();
  }, [refreshClientId]);

  return pipe(
    online,
    boolean.fold(
      () => (
        <Result
          status="warning"
          title="No internet connection."
          subTitle="Code Expert requires an active internet connection to be able to work correctly."
        />
      ),
      () => (
        <GuardRemote
          value={clientIdRD}
          pending={() => <div>Loading …</div>}
          render={(clientId) =>
            globalSetupState.fold(setupState, {
              setup: ({ state }) => <Setup state={state} />,
              update: ({ manifest }) => <Updater manifest={manifest} />,
              setupDone: () =>
                routes.fold(currentRoute, {
                  settings: () => (
                    <AppLayout>
                      <Settings />
                    </AppLayout>
                  ),
                  logout: () => (
                    <AppLayout>
                      <Logout />
                    </AppLayout>
                  ),
                  courses: () => (
                    <AppLayout>
                      <Courses />
                    </AppLayout>
                  ),
                  projects: ({ course }) => (
                    <AppLayout>
                      <Projects clientId={clientId} course={course} />
                    </AppLayout>
                  ),
                  developer: () => (
                    <AppLayout>
                      <Developer />
                    </AppLayout>
                  ),
                }),
            })
          }
        />
      ),
    ),
  );
}
