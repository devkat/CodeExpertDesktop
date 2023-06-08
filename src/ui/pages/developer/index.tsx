import { BaseDirectory } from '@tauri-apps/api/fs';
import { Alert, Button } from 'antd';
import React from 'react';
import { iots, pipe, task, taskEither, taskOption } from '@code-expert/prelude';
import { globalSetupState, setupState } from '@/domain/Setup';
import { createSignedAPIRequest } from '@/domain/createAPIRequest';
import { Exception } from '@/domain/exception';
import { fs } from '@/lib/tauri';
import { routes, useGlobalContextWithActions } from '@/ui/GlobalContext';
import { VStack } from '@/ui/foundation/Layout';
import { messageT } from '@/ui/helper/message';
import { notificationT } from '@/ui/helper/notifications';
import { deleteLocalProject } from '../projects/hooks/useProjectRemove';

export function Developer() {
  const [{ projectRepository }, dispatchContext] = useGlobalContextWithActions();

  const testAuth = () => {
    void pipe(
      createSignedAPIRequest({
        path: 'app/checkAccess',
        method: 'GET',
        payload: {},
        codec: iots.strict({ status: iots.string }),
      }),
      taskEither.fold(
        (e) => notificationT.error(`You are not authorized: ${e.message}`),
        (d) => messageT.success(d.status),
      ),
      task.run,
    );
  };

  const cleanConfig = () => {
    void pipe(
      projectRepository.projects.get(),
      taskOption.fromPredicate((projects) => projects.length > 0),
      taskOption.fold(
        () => taskEither.right<Exception, unknown>(undefined),
        taskEither.traverseSeqArray((project) =>
          pipe(
            deleteLocalProject(projectRepository)(project.value.projectId),
            taskEither.chain(() =>
              fs.removeFile(`project_${project.value.projectId}.json`, {
                dir: BaseDirectory.AppLocalData,
              }),
            ),
          ),
        ),
      ),
      taskEither.alt(() => taskEither.right<Exception, unknown>(undefined)),
      // chainFirstTaskK(() => TaskEither<E, A>) <=> ignore errors
      taskEither.chainFirstTaskK(() =>
        taskEither.sequenceT(
          fs.removeFile('settings.json', { dir: BaseDirectory.AppLocalData }),
          fs.removeFile('privateKey.pem', { dir: BaseDirectory.AppLocalData }),
        ),
      ),
      taskEither.fold(
        (e) => notificationT.error(`${e.message} : You are not authorized`),
        () => notificationT.success('deleted config data'),
      ),
      task.map(() => {
        dispatchContext({
          setupState: globalSetupState.setup({ state: setupState.notAuthorized() }),
          currentPage: routes.main(),
        });
        return undefined;
      }),
      task.run,
    );
  };

  return (
    <VStack gap={8}>
      <Alert
        type="error"
        message={<>This page is for developers only. Any actions here can destroy your data.</>}
      />
      <Button
        onClick={() => {
          dispatchContext({ currentPage: routes.main() });
        }}
        block
      >
        Close developer view
      </Button>

      <Button onClick={testAuth} block>
        Test auth
      </Button>
      <Button onClick={cleanConfig} block danger>
        Clean all settings
      </Button>
    </VStack>
  );
}