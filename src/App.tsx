import { Result } from 'antd';
import React, { useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { boolean, constVoid, pipe, remoteData } from '@code-expert/prelude';
import { registerApp } from '@/application/registerApp';
import { globalSetupState } from '@/domain/Setup';
import { useGlobalContextWithActions } from '@/ui/GlobalContext';
import useNetworkState from '@/ui/hooks/useNetwork';
import { useRemoteData2 } from '@/ui/hooks/useRemoteData';
import { AppLayout } from '@/ui/layout';
import { Main } from '@/ui/pages/Main';
import { Developer } from '@/ui/pages/developer';
import { Logout } from '@/ui/pages/logout';
import { Settings } from '@/ui/pages/settings';
import { Setup } from '@/ui/pages/setup';
import { routes, useRoute } from '@/ui/routes';

export function App() {
  const { online } = useNetworkState();
  const [{ setupState }] = useGlobalContextWithActions();
  const { currentRoute, navigateTo } = useRoute();
  const [clientIdRD, refreshClientId] = useRemoteData2(registerApp);

  useHotkeys('ctrl+c+x', () => {
    if (remoteData.isSuccess(clientIdRD)) {
      navigateTo(routes.developer(clientIdRD.value));
    }
  });

  // Startup
  useEffect(() => {
    pipe(
      clientIdRD,
      remoteData.fold3(constVoid, constVoid, (clientId) => {
        if (routes.is.startup(currentRoute)) navigateTo(routes.main(clientId));
      }),
    );
  }, [clientIdRD, currentRoute, navigateTo]);

  useEffect(() => {
    refreshClientId({});
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
      () =>
        globalSetupState.fold(setupState, {
          setup: ({ state }) => <Setup state={state} />,
          setupDone: () =>
            routes.fold(currentRoute, {
              startup: () => <div>Starting …</div>,
              settings: (clientId) => (
                <AppLayout clientId={clientId}>
                  <Settings clientId={clientId} />
                </AppLayout>
              ),
              logout: (clientId) => (
                <AppLayout clientId={clientId}>
                  <Logout clientId={clientId} />
                </AppLayout>
              ),
              main: (clientId) => (
                <AppLayout clientId={clientId}>
                  <Main clientId={clientId} />
                </AppLayout>
              ),
              developer: (clientId) => (
                <AppLayout clientId={clientId}>
                  <Developer clientId={clientId} />
                </AppLayout>
              ),
            }),
        }),
    ),
  );
}
