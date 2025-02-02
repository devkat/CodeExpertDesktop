import { Store as TauriStore } from 'tauri-plugin-store-api';
import {
  array,
  constVoid,
  either,
  flow,
  iots,
  option,
  pipe,
  task,
  taskOption,
} from '@code-expert/prelude';
import { ProjectId } from '@/domain/Project';
import { ProjectMetadata } from '@/domain/ProjectMetadata';
import { panic } from '@/utils/error';

const store = new TauriStore('project_metadata.json');

export const projectMetadataStore = {
  find: (projectId: ProjectId): taskOption.TaskOption<ProjectMetadata> =>
    pipe(
      taskOption.tryCatch(() => store.get(projectId)),
      taskOption.chainOptionK(flow(ProjectMetadata.decode, option.fromEither)),
    ),
  findAll: (): taskOption.TaskOption<Array<ProjectMetadata>> =>
    pipe(
      taskOption.tryCatch(() => store.values()),
      taskOption.chainOptionK(flow(iots.array(ProjectMetadata).decode, option.fromEither)),
    ),
  write: (value: ProjectMetadata): taskOption.TaskOption<void> =>
    taskOption.tryCatch(() => store.set(value.projectId, value).then(() => store.save())),
  remove: (projectId: ProjectId): task.Task<void> =>
    pipe(
      taskOption.tryCatch(() => store.delete(projectId).then(() => store.save())),
      task.map(constVoid),
    ),
  writeAll: (projects: Array<ProjectMetadata>): taskOption.TaskOption<void> =>
    pipe(
      taskOption.tryCatch(() =>
        pipe(
          iots.array(ProjectMetadata).decode(projects),
          either.getOrElseW((errs) =>
            panic(`Project metadata is incorrect: ${iots.formatValidationErrors(errs).join('; ')}`),
          ),
          array.map((x) => store.set(x.projectId, x)),
          (xs) => Promise.allSettled(xs),
        ),
      ),
      taskOption.chainFirstTaskK(() => () => store.save()),
      taskOption.chainOptionK(flow(iots.array(ProjectMetadata).decode, option.fromEither)),
      taskOption.map(constVoid),
    ),
};
