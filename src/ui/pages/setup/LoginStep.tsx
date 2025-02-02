import { Alert, Button, Typography } from 'antd';
import React from 'react';
import { pipe, task } from '@code-expert/prelude';
import { authState, useAuthState } from '@/domain/AuthState';
import { ClientId } from '@/domain/ClientId';
import { getSetupState } from '@/domain/Setup';
import { useGlobalContextWithActions } from '@/ui/GlobalContext';

const AuthWarning = ({
  warning,
  cancelAuthorization,
}: {
  warning: string;
  cancelAuthorization: () => void;
}) => (
  <Alert
    message={
      <Typography.Text>
        {warning}, please{' '}
        <Button type="link" onClick={cancelAuthorization} style={{ padding: 0 }}>
          try again
        </Button>
        .
      </Typography.Text>
    }
    type="warning"
    showIcon
  />
);
export const LoginStep = ({ clientId }: { clientId: ClientId }) => {
  const [{ projectRepository }, dispatch] = useGlobalContextWithActions();

  const { state, startAuthorization, cancelAuthorization } = useAuthState(clientId, () =>
    pipe(
      getSetupState(projectRepository),
      task.map((state) => dispatch({ setupState: state })),
      task.run,
    ),
  );

  return (
    <>
      <Typography.Paragraph>
        You will be redirected to the Code Expert website to confirm that this app is authorised to
        access your projects.
      </Typography.Paragraph>
      {authState.fold(state, {
        startingAuthorization: ({ redirectLink, code_verifier }) => (
          <Button
            type="primary"
            href={redirectLink}
            onClick={() => startAuthorization(code_verifier)}
            target="_blank"
          >
            Authorize Code Expert Sync
          </Button>
        ),
        deniedAuthorization: () => (
          <AuthWarning warning="Denied authorization" cancelAuthorization={cancelAuthorization} />
        ),
        timeoutAuthorization: () => (
          <AuthWarning warning="Timed out" cancelAuthorization={cancelAuthorization} />
        ),
        waitingForAuthorization: () => (
          <>
            <Button type="primary" loading target="_blank">
              Authorize Code Expert Sync
            </Button>
            <Typography.Paragraph>
              Waiting for confirmation …{' '}
              <Button danger type="link" onClick={cancelAuthorization}>
                Cancel
              </Button>
            </Typography.Paragraph>
          </>
        ),
      })}
    </>
  );
};
