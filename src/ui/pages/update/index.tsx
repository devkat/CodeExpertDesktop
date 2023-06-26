import { relaunch } from '@tauri-apps/api/process';
import { UpdateManifest, installUpdate } from '@tauri-apps/api/updater';
import { Alert, Button, Spin, Typography } from 'antd';
import React from 'react';
import { pipe, tagged, taskEither } from '@code-expert/prelude';
import { Box, VStack } from '@/ui/foundation/Layout';

export type UpdateStatus =
  | tagged.Tagged<'start'>
  | tagged.Tagged<'pending'>
  | tagged.Tagged<'done'>
  | tagged.Tagged<'error', string>;

const installUpdateT = taskEither.tryCatch(
  () => installUpdate(),
  (e) => e as string,
);

const relaunchT = taskEither.tryCatch(
  () => relaunch(),
  (e) => e as string,
);

export const updateStatus = tagged.build<UpdateStatus>();
export function Updater(props: { manifest: UpdateManifest }) {
  const href = `https://github.com/CodeExpertETH/CodeExpertDesktop/releases/tag/v${props.manifest.version}`;
  const [status, setStatus] = React.useState<UpdateStatus>(updateStatus.start);
  const installUpdateL = () =>
    pipe(
      taskEither.fromIO(() => setStatus(updateStatus.pending)),
      taskEither.chain(() => installUpdateT),
      taskEither.chain(() => relaunchT),
      taskEither.fold(
        (e) => taskEither.fromIO(() => setStatus(updateStatus.error(e))),
        () => taskEither.fromIO(() => setStatus(updateStatus.done)),
      ),
      taskEither.run,
    );

  return (
    <VStack align="start" justify="start" gap="md" mh>
      <Typography.Title level={5} type="secondary" style={{ marginTop: '1rem' }}>
        Update
      </Typography.Title>
      <Typography.Title level={1} style={{ marginTop: 0 }}>
        Update available
      </Typography.Title>
      <Typography.Paragraph strong>
        Update to version {props.manifest.version} available.
      </Typography.Paragraph>
      <Typography.Link href={href} target="_blank">
        Release notes
      </Typography.Link>

      <Box>
        {updateStatus.fold(status, {
          pending: () => <Spin />,
          start: () => (
            <Alert
              type="info"
              message="Update"
              description="To continue using Code Expert Sync you need to install the update"
              showIcon
            />
          ),
          error: (error) => (
            <Alert
              type="error"
              message="Error during update"
              description={`${error}\nPlease install the update manual.`}
              showIcon
            />
          ),
          done: () => (
            <Alert
              type="success"
              message="Update installed"
              description="Installed the update"
              showIcon
            />
          ),
        })}
      </Box>
      <Button
        type="primary"
        loading={updateStatus.is.pending(status)}
        disabled={!updateStatus.is.start(status)}
        block
        onClick={installUpdateL}
      >
        Automatic install update and restart
      </Button>

      <Button block href={href} target="_blank">
        Manual download update
      </Button>
    </VStack>
  );
}