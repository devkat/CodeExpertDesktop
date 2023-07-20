import {
  array,
  either,
  flow,
  iots,
  option,
  pipe,
  record,
  task,
  taskOption,
} from '@code-expert/prelude';
import { ProjectId } from '@/domain/Project';
import { ProjectMetadata } from '@/domain/ProjectMetadata';
import { tauriStore } from '@/lib/tauri/TauriStore';
import { panic } from '@/utils/error';

const store = tauriStore('project_metadata.json');

export const projectMetadataStore = {
  find: (projectId: ProjectId): taskOption.TaskOption<ProjectMetadata> =>
    pipe(
      store.get(projectId),
      taskOption.chainOptionK(flow(ProjectMetadata.decode, option.fromEither)),
    ),

  findAll: (): taskOption.TaskOption<Array<ProjectMetadata>> =>
    pipe(store.values, task.map(flow(iots.array(ProjectMetadata).decode, option.fromEither))),

  write: (value: ProjectMetadata): task.Task<void> => store.set(value.projectId, value),

  remove: (projectId: ProjectId): task.Task<void> => store.delete(projectId),

  writeAll: (projects: Array<ProjectMetadata>): task.Task<void> =>
    pipe(
      iots.array(ProjectMetadata).decode(projects),
      either.getOrElseW((errs) =>
        panic(`Project metadata is incorrect: ${iots.formatValidationErrors(errs).join('; ')}`),
      ),
      array.map((x): [string, unknown] => [x.projectId, x]),
      record.fromEntries,
      store.setMany,
    ),
};
