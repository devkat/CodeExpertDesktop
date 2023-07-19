import { either, pipe, task, taskEither } from '@code-expert/prelude';
import { LocalProject } from '@/domain/Project';
import { SyncException, syncExceptionADT } from '@/domain/SyncException';
import { exists } from '@/lib/tauri/fs';

export const verifyProjectConsistency = ({
  value: { basePath },
}: LocalProject): taskEither.TaskEither<SyncException, void> =>
  pipe(
    exists(basePath),
    task.map(
      either.guard(() =>
        syncExceptionADT.fileSystemCorrupted({
          path: basePath,
          reason: 'Project directory does not exist.',
        }),
      ),
    ),
  );
