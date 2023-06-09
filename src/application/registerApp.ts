import { getName, getVersion } from '@tauri-apps/api/app';
import { api } from 'api';
import {
  either,
  flow,
  iots,
  option,
  pipe,
  task,
  taskEither,
  taskOption,
} from '@code-expert/prelude';
import { ClientId } from '@/domain/ClientId';
import { createAPIRequest, requestBody } from '@/domain/createAPIRequest';
import { fromError } from '@/domain/exception';

const getClientToken: task.Task<string> = pipe(
  createAPIRequest({
    method: 'GET',
    path: 'app/clientId',
    codec: iots.strict({ token: iots.string }),
  }),
  taskEither.map(({ token }) => token),
  task.map(either.getOrThrow(fromError)),
);

const getSystemInfo: task.Task<{ os: string; name: string; version: string }> = task.sequenceS({
  os: pipe(
    api.getSystemInfo,
    taskOption.getOrElse(() => task.of('N/A')),
  ) /* TODO Figure out actual runtime type of getSystemInfo */,
  name: getName,
  version: getVersion,
});

export const registerApp = (): task.Task<ClientId> =>
  pipe(
    api.settingRead('clientId', ClientId),
    taskOption.altW(() =>
      pipe(
        getSystemInfo,
        task.bind('token', () => getClientToken),
        task.chain((payload) =>
          pipe(
            createAPIRequest({
              method: 'POST',
              path: 'app/register',
              body: requestBody.json({
                ...payload,
                permissions: ['user:read', 'project:read', 'project:write'],
              }),
              codec: iots.strict({ clientId: ClientId }),
            }),
            taskEither.map(({ clientId }) => clientId),
            taskEither.chainFirstTaskK((clientId) => api.settingWrite('clientId', clientId)),
            task.map(flow(either.getOrThrow(fromError), option.some)),
          ),
        ),
      ),
    ),
    task.map(
      option.getOrThrow(() => new Error('No client id was found. Please contact the developers.')),
    ),
  );
