import { ResponseType } from '@tauri-apps/api/http';
import { api } from 'api';
import React from 'react';
import {
  array,
  boolean,
  constFalse,
  constTrue,
  constVoid,
  either,
  eq,
  flow,
  iots,
  monoid,
  nonEmptyArray,
  option,
  pipe,
  string,
  tagged,
  task,
  taskEither,
  taskOption,
  tree,
} from '@code-expert/prelude';
import {
  File,
  FileEntryType,
  FileEntryTypeC,
  File as FileInfo,
  FilePermissions,
  FilePermissionsC,
  isFile,
  isValidDirName,
  isValidFileName,
} from '@/domain/File';
import { LocalProject, Project, ProjectId, projectADT, projectPrism } from '@/domain/Project';
import { ProjectMetadata } from '@/domain/ProjectMetadata';
import { SyncException, changesADT, syncExceptionADT, syncStateADT } from '@/domain/SyncState';
import { createSignedAPIRequest, requestBody } from '@/domain/createAPIRequest';
import { Exception, fromError, invariantViolated } from '@/domain/exception';
import { fs as libFs, os as libOs, path as libPath } from '@/lib/tauri';
import { removeFile } from '@/lib/tauri/fs';
import { useGlobalContext } from '@/ui/GlobalContext';
import { useTimeContext } from '@/ui/contexts/TimeContext';

const fromException = <A>(
  te: taskEither.TaskEither<Exception, A>,
): taskEither.TaskEither<SyncException, A> =>
  pipe(te, taskEither.getOrThrow(fromError), task.map(either.of));

// -------------------------------------------------------------------------------------------------

const writeSingeFile = ({
  projectFilePath,
  projectId,
  projectDir,
  version,
  permissions,
  type,
}: {
  projectFilePath: string;
  projectId: ProjectId;
  projectDir: string;
  version: number;
  permissions: FilePermissions;
  type: FileEntryType;
}): taskEither.TaskEither<SyncException, File> =>
  pipe(
    taskEither.Do,
    taskEither.bind('systemFilePath', () =>
      fromException(libPath.join(projectDir, projectFilePath)),
    ),
    taskEither.chainFirst(({ systemFilePath }) =>
      pipe(
        api.createProjectDir(projectDir),
        taskEither.fromTaskOption(() =>
          syncExceptionADT.fileSystemCorrupted({
            path: projectDir,
            reason: 'Project dir could not be created',
          }),
        ),
        taskEither.chain(() =>
          fromException(
            createSignedAPIRequest({
              path: `project/${projectId}/file`,
              method: 'GET',
              jwtPayload: { path: projectFilePath },
              codec: iots.string,
              responseType: ResponseType.Text,
            }),
          ),
        ),
        taskEither.chainW((fileContent) =>
          fromException(api.writeProjectFile(systemFilePath, fileContent, permissions === 'r')),
        ),
      ),
    ),
    taskEither.bindW('hash', ({ systemFilePath }) =>
      fromException(api.getFileHash(systemFilePath)),
    ),
    taskEither.map(({ hash }) => ({
      path: projectFilePath,
      version,
      hash,
      type,
      permissions,
    })),
  );

const deleteSingeFile = ({
  projectFilePath,
  projectDir,
}: {
  projectFilePath: string;
  projectDir: string;
}): task.Task<void> =>
  pipe(
    libPath.join(projectDir, projectFilePath),
    taskEither.chain(removeFile),
    taskEither.getOrThrow(fromError),
  );

const addHash =
  (projectDir: string) =>
  ({
    path,
    type,
  }: {
    path: string;
    type: 'file';
  }): task.Task<{ path: string; type: 'file'; hash: string }> =>
    pipe(
      libPath.join(projectDir, path),
      taskEither.chain(api.getFileHash),
      taskEither.getOrThrow(fromError),
      task.map((hash) => ({ path, type, hash })),
    );

const getProjectFilesLocal = (
  projectDir: string,
): taskEither.TaskEither<SyncException, ReadonlyArray<{ path: string; type: 'file' }>> =>
  pipe(
    libFs.readDirTree(projectDir),
    taskEither.map(
      flow(
        tree.foldMap(array.getMonoid<{ path: string; type: FileEntryType }>())(array.of),
        array.filter(isFile),
      ),
    ),
    taskEither.chain(
      taskEither.traverseArray(({ path, type }) =>
        pipe(
          libPath.stripAncestor(projectDir)(path),
          taskEither.map((relative) => ({ path: relative, type })),
        ),
      ),
    ),
    taskEither.mapLeft((e) =>
      syncExceptionADT.fileSystemCorrupted({
        path: projectDir,
        reason: `Could not read project files (${e.reason})`,
      }),
    ),
  );

/**
 * Possible Exceptions:
 * - has been synced before, but dir not present
 * - can't read dir or subdir
 *
 * By requiring {@link LocalProject} we have handled case 1. Case 2 & 3 are textbook exception, no need to differentiate
 */
const getProjectInfoLocal = (
  projectDir: string,
  _: LocalProject,
): taskEither.TaskEither<SyncException, Array<LocalFileState>> =>
  pipe(
    getProjectFilesLocal(projectDir),
    taskEither.chainW(
      flow(
        taskEither.traverseArray(flow(addHash(projectDir), taskEither.fromTask)),
        taskEither.map(array.unsafeFromReadonly),
      ),
    ),
  );

interface RemoteFileState {
  path: string;
  type: FileEntryType;
  version: number;
}

interface RemoteFileChange {
  path: string;
  change:
    | tagged.Tagged<'noChange'>
    | tagged.Tagged<'updated', number>
    | tagged.Tagged<'removed'>
    | tagged.Tagged<'added', number>;
}

const remoteFileChange = tagged.build<RemoteFileChange['change']>();

interface LocalFileState {
  path: string;
  type: FileEntryType;
  hash: string;
}

interface LocalFileChange {
  path: string;
  change:
    | tagged.Tagged<'noChange'>
    | tagged.Tagged<'updated'>
    | tagged.Tagged<'removed'>
    | tagged.Tagged<'added'>;
}

interface Conflict {
  path: string;
  changeRemote: RemoteFileChange['change'];
  changeLocal: LocalFileChange['change'];
}

const localFileChange = tagged.build<LocalFileChange['change']>();

const eqPath = eq.struct({
  path: string.Eq,
});

const getRemoteChanges = (
  previous: Array<RemoteFileState>,
  latest: Array<RemoteFileState>,
): option.Option<NonEmptyArray<RemoteFileChange>> => {
  const previousFiles = pipe(previous, array.filter(isFile));
  const latestFiles = pipe(latest, array.filter(isFile));
  const removed: Array<RemoteFileChange> = pipe(
    previousFiles,
    array.difference<RemoteFileState>(eqPath)(latestFiles),
    array.map(({ path }) => ({ path, change: remoteFileChange.removed() })),
  );
  const added: Array<RemoteFileChange> = pipe(
    latestFiles,
    array.difference<RemoteFileState>(eqPath)(previousFiles),
    array.map(({ path, version }) => ({ path, change: remoteFileChange.added(version) })),
  );
  const updated: Array<RemoteFileChange> = pipe(
    previousFiles,
    array.filter((ls) =>
      pipe(
        latestFiles,
        array.findFirst((cs) => cs.path === ls.path),
        option.exists((cs) => cs.version !== ls.version),
      ),
    ),
    array.map(({ path, version }) => ({ path, change: remoteFileChange.updated(version) })),
  );
  return pipe(
    [removed, added, updated],
    monoid.concatAll(array.getMonoid()),
    nonEmptyArray.fromArray,
  );
};

const getLocalChanges = (
  previous: Array<FileInfo>,
  latest: Array<LocalFileState>,
): option.Option<NonEmptyArray<LocalFileChange>> => {
  const previousFiles = pipe(previous, array.filter(isFile));
  const latestFiles = pipe(latest, array.filter(isFile));
  const removed: Array<LocalFileChange> = pipe(
    previousFiles,
    array.difference<LocalFileState>(eqPath)(latestFiles),
    array.map(({ path }) => ({ path, change: localFileChange.removed() })),
  );
  const added: Array<LocalFileChange> = pipe(
    latestFiles,
    array.difference<LocalFileState>(eqPath)(previousFiles),
    array.map(({ path }) => ({ path, change: localFileChange.added() })),
  );
  const updated: Array<LocalFileChange> = pipe(
    previousFiles,
    array.bindTo('previous'),
    array.bind('latest', ({ previous }) =>
      pipe(
        latestFiles,
        array.findFirst((latest) => eqPath.equals(previous, latest)),
        option.fold(() => [], array.of),
      ),
    ),
    array.filter(({ latest, previous }) => latest.hash !== previous.hash),
    array.map(({ latest: { path } }) => ({
      path,
      change: localFileChange.updated(),
    })),
  );
  return pipe(
    [removed, added, updated],
    monoid.concatAll(array.getMonoid()),
    nonEmptyArray.fromArray,
  );
};

const getConflicts = (
  local: NonEmptyArray<LocalFileChange>,
  remote: NonEmptyArray<RemoteFileChange>,
): option.Option<NonEmptyArray<Conflict>> => {
  const conflicts: Array<Conflict> = pipe(
    local,
    array.intersection<LocalFileChange>(eqPath)(remote),
    array.map((changeLocal) => ({
      path: changeLocal.path,
      changeLocal: changeLocal.change,
      changeRemote: pipe(
        remote,
        array.findFirst((changeRemote) => eqPath.equals(changeLocal, changeRemote)),
        option.map(({ change }) => change),
        option.getOrElseW(() => remoteFileChange.noChange()),
      ),
    })),
  );
  return pipe(conflicts, nonEmptyArray.fromArray);
};

const RemoteFileInfoC = iots.strict({
  path: iots.string,
  version: iots.number,
  type: FileEntryTypeC,
  permissions: FilePermissionsC,
});

type RemoteFileInfo = iots.TypeOf<typeof RemoteFileInfoC>;

const getProjectInfoRemote = (
  projectId: ProjectId,
): task.Task<{ _id: ProjectId; files: Array<RemoteFileInfo> }> =>
  pipe(
    createSignedAPIRequest({
      path: `project/${projectId}/info`,
      method: 'GET',
      jwtPayload: {},
      codec: iots.strict({
        _id: ProjectId,
        files: iots.array(RemoteFileInfoC),
      }),
    }),
    taskEither.getOrThrow(fromError),
  );

const getProjectDirRelative = ({
  semester,
  courseName,
  exerciseName,
  taskName,
}: ProjectMetadata): task.Task<string> =>
  pipe(
    libPath.join(
      libPath.escape(semester),
      libPath.escape(courseName),
      libPath.escape(exerciseName),
      libPath.escape(taskName),
    ),
    taskEither.getOrThrow(fromError),
  );

const findClosest =
  <A>(map: (path: string) => option.Option<A>) =>
  (relPath: string): taskEither.TaskEither<SyncException, A> =>
    pipe(
      map(relPath),
      option.fold(
        () =>
          relPath === '.'
            ? taskEither.left(
                syncExceptionADT.fileSystemCorrupted({
                  path: relPath,
                  reason: 'Root directory must exist',
                }),
              )
            : pipe(libPath.dirname(relPath), fromException, taskEither.chain(findClosest(map))),
        taskEither.of,
      ),
    );

const checkClosestExistingAncestorIsWritable: (
  remote: Array<RemoteFileInfo>,
) => (c: LocalFileChange) => taskEither.TaskEither<SyncException, LocalFileChange> = (remote) =>
  flow(
    taskEither.of,
    taskEither.chainFirst(({ path }) =>
      pipe(
        path,
        findClosest((closestPath) =>
          pipe(
            remote,
            array.findFirst((i) => i.path === closestPath),
            option.map((i) => i.permissions === 'rw'),
          ),
        ),
        taskEither.filterOrElse(boolean.isTrue, () =>
          syncExceptionADT.wide.readOnlyFilesChanged({
            path,
            reason: 'Parent directory is read-only',
          }),
        ),
      ),
    ),
  );

const checkValidFileName: (
  c: LocalFileChange,
) => taskEither.TaskEither<SyncException, LocalFileChange> = flow(
  taskEither.of,
  taskEither.chainFirst(({ path }) =>
    pipe(
      fromException(libPath.basename(path)),
      taskEither.filterOrElse(isValidFileName, (filename) =>
        syncExceptionADT.wide.invalidFilename(filename),
      ),
    ),
  ),
);

const checkEveryNewAncestorIsValidDirName =
  (remote: Array<RemoteFileInfo>) =>
  (change: LocalFileChange): taskEither.TaskEither<SyncException, LocalFileChange> => {
    const ancestors = (path: string): task.Task<Array<either.Either<SyncException, string>>> =>
      array.unfoldTaskK(
        either.of<SyncException, string>(path),
        flow(
          // if the previous call produced an error, do not continue
          taskOption.fromEither<string>,
          // tauri.path.dirname is silly and returns an error if passing '.' or '/', so we need to abort before that
          taskOption.filter((path) => path !== '.'),
          taskOption.chain(
            flow(
              libPath.dirname,
              fromException,
              task.map((x) => option.of([x, x])),
            ),
          ),
        ),
      );

    const isExisting = (path: string) => remote.some((i) => i.path === path);
    const isNew = (path: string) => !isExisting(path);
    return pipe(
      ancestors(change.path),
      task.map(either.sequenceArray),
      taskEither.chain(
        flow(
          array.filter(isNew),
          array.traverse(taskEither.ApplicativePar)(flow(libPath.basename, fromException)),
          taskEither.filterOrElse(array.every(isValidDirName), (paths) =>
            syncExceptionADT.wide.fileSystemCorrupted({
              path: paths.join('/'),
              reason: 'Parent directory has invalid name',
            }),
          ),
        ),
      ),
      taskEither.map(() => change),
    );
  };

const isFileWritable =
  (remote: Array<RemoteFileInfo>) =>
  (c: LocalFileChange): boolean =>
    pipe(
      remote,
      array.findFirst((i) => i.path === c.path),
      option.fold(constFalse, (i) => i.permissions === 'rw'),
    );

// TODO: filter localChanges that are in conflict with remoteChanges
/**
 * Pre-conditions:
 * - filter conflicting changes
 *
 * The LocalFileChange gets computed by comparing local file system state with previously synced remote state. If a file
 * gets categorized as 'updated', but the file has been 'removed' on the remote, we would be unable to determine it's
 * permissions.
 */
const getFilesToUpload = (
  local: Array<LocalFileChange>,
  remote: Array<RemoteFileInfo>,
): taskEither.TaskEither<SyncException, Array<LocalFileChange>> =>
  pipe(
    local,
    array.filter((c) =>
      localFileChange.fold(c.change, {
        noChange: constFalse,
        added: constTrue,
        removed: constTrue,
        updated: constTrue,
      }),
    ),
    taskEither.traverseArray((x) =>
      pipe(
        x,
        localFileChange.fold<
          (c: LocalFileChange) => taskEither.TaskEither<SyncException, LocalFileChange>
        >(x.change, {
          noChange: () => () => {
            throw invariantViolated('File has no changes');
          },
          added: () =>
            flow(
              checkClosestExistingAncestorIsWritable(remote),
              taskEither.chain(checkEveryNewAncestorIsValidDirName(remote)),
              taskEither.chainFirst(checkValidFileName),
            ),
          removed: () =>
            flow(
              taskEither.fromPredicate(isFileWritable(remote), () =>
                syncExceptionADT.readOnlyFilesChanged({ path: '', reason: 'File is read-only' }),
              ),
              taskEither.chain(checkClosestExistingAncestorIsWritable(remote)),
            ),
          updated: () =>
            taskEither.fromPredicate(isFileWritable(remote), () =>
              syncExceptionADT.readOnlyFilesChanged({ path: '', reason: 'File is read-only' }),
            ),
        }),
      ),
    ),
    taskEither.map(array.unsafeFromReadonly),
  );

const getFilesToDownload =
  (projectInfoRemote: Array<RemoteFileInfo>) =>
  (remoteChanges: Array<RemoteFileChange>): Array<RemoteFileInfo> =>
    pipe(
      projectInfoRemote,
      array.filter(({ path }) =>
        pipe(
          remoteChanges,
          array.filter((c) =>
            remoteFileChange.fold(c.change, {
              noChange: constFalse,
              added: constTrue,
              removed: constFalse,
              updated: constTrue,
            }),
          ),
          array.exists((file) => file.path === path),
        ),
      ),
    );

const getFilesToDelete = (remoteChanges: Array<RemoteFileChange>): Array<RemoteFileChange> =>
  pipe(
    remoteChanges,
    array.filter((c) =>
      remoteFileChange.fold(c.change, {
        noChange: constFalse,
        added: constFalse,
        removed: constTrue,
        updated: constFalse,
      }),
    ),
  );

export const uploadChangedFiles = (
  fileName: string,
  projectId: ProjectId,
  projectDir: string,
  localChanges: Array<LocalFileChange>,
): task.Task<void> =>
  pipe(
    taskEither.Do,
    taskEither.let('uploadFiles', () =>
      pipe(
        localChanges,
        array.filter((c) =>
          localFileChange.fold(c.change, {
            noChange: constFalse,
            added: constTrue,
            removed: constFalse,
            updated: constTrue,
          }),
        ),
        array.map(({ path }) => path),
      ),
    ),
    taskEither.bind('archivePath', () =>
      pipe(
        libOs.tempDir(),
        taskEither.chain((tempDir) => libPath.join(tempDir, fileName)),
        taskEither.map((e) => {
          console.log(e);
          return e;
        }),
      ),
    ),
    taskEither.bind('tarHash', ({ uploadFiles, archivePath }) =>
      api.buildTar(archivePath, projectDir, uploadFiles),
    ),
    taskEither.let('removeFiles', () =>
      pipe(
        localChanges,
        array.filter((c) =>
          localFileChange.fold(c.change, {
            noChange: constFalse,
            added: constFalse,
            removed: constTrue,
            updated: constFalse,
          }),
        ),
        array.map(({ path }) => path),
      ),
    ),
    taskEither.bind('body', ({ uploadFiles, archivePath }) =>
      array.isEmpty(uploadFiles)
        ? taskEither.of(new Uint8Array())
        : libFs.readBinaryFile(archivePath),
    ),
    taskEither.chain(({ body, tarHash, removeFiles, uploadFiles }) =>
      createSignedAPIRequest({
        method: 'POST',
        path: `project/${projectId}/files`,
        jwtPayload: array.isEmpty(uploadFiles) ? { removeFiles } : { tarHash, removeFiles },
        body: requestBody.binary({
          body,
          type: 'application/x-tar',
          encoding: option.some('br'),
        }),
        codec: iots.strict({
          _id: ProjectId,
          files: iots.array(RemoteFileInfoC),
        }),
      }),
    ),
    taskEither.getOrThrow(fromError),
    task.map(constVoid),
  );

const checkConflicts = <R>({
  localChanges,
  remoteChanges,
}: {
  localChanges: option.Option<NonEmptyArray<LocalFileChange>>;
  remoteChanges: option.Option<NonEmptyArray<RemoteFileChange>>;
} & R): either.Either<SyncException, void> =>
  pipe(
    option.sequenceS({ local: localChanges, remote: remoteChanges }),
    option.chain(({ local, remote }) => getConflicts(local, remote)),
    option.fold(
      () => either.right(undefined),
      (conflicts) => {
        console.log(conflicts);
        return either.left(syncExceptionADT.conflictingChanges());
      },
    ),
  );

export const useProjectSync = () => {
  const time = useTimeContext();
  const { projectRepository } = useGlobalContext();

  return React.useCallback(
    (project: Project): taskEither.TaskEither<SyncException, unknown> =>
      pipe(
        taskEither.Do,

        // setup
        taskEither.bind('rootDir', () =>
          pipe(
            api.settingRead('projectDir', iots.string),
            taskEither.fromTaskOption(() => syncExceptionADT.projectDirMissing()),
          ),
        ),
        // This is where it *should* be
        taskEither.bindW('projectDirRelative', () =>
          pipe(
            projectADT.fold(project, {
              remote: (metadata) => getProjectDirRelative(metadata),
              local: ({ basePath }) => task.of(basePath),
            }),
            taskEither.fromTask,
          ),
        ),
        taskEither.bind('projectDir', ({ rootDir, projectDirRelative }) =>
          fromException(libPath.join(rootDir, projectDirRelative)),
        ),
        // change detection
        taskEither.let('projectInfoPrevious', () =>
          pipe(
            projectPrism.local.getOption(project),
            option.map(({ value: { files } }) => files),
          ),
        ),
        taskEither.bindW('projectInfoRemote', () =>
          pipe(getProjectInfoRemote(project.value.projectId), taskEither.fromTask),
        ),
        taskEither.bind('projectInfoLocal', ({ projectDir }) =>
          pipe(
            projectPrism.local.getOption(project),
            option.traverse(taskEither.ApplicativePar)((project) =>
              getProjectInfoLocal(projectDir, project),
            ),
          ),
        ),
        taskEither.let('remoteChanges', ({ projectInfoRemote, projectInfoPrevious }) =>
          pipe(
            projectInfoPrevious,
            option.fold(
              // the project has never been synced before
              () => getRemoteChanges([], projectInfoRemote.files),
              (previous) => getRemoteChanges(previous, projectInfoRemote.files),
            ),
          ),
        ),
        taskEither.let('localChanges', ({ projectInfoLocal, projectInfoPrevious }) =>
          pipe(
            option.sequenceS({ local: projectInfoLocal, previous: projectInfoPrevious }),
            option.chain(({ local, previous }) => getLocalChanges(previous, local)),
          ),
        ),
        taskEither.chainFirstEitherKW(checkConflicts),
        taskEither.bind('filesToUpload', ({ localChanges, projectInfoRemote }) =>
          pipe(
            localChanges,
            option.traverse(taskEither.ApplicativePar)((changes) =>
              getFilesToUpload(changes, projectInfoRemote.files),
            ),
          ),
        ),
        taskEither.let('filesToDownload', ({ remoteChanges, projectInfoRemote }) =>
          pipe(remoteChanges, option.map(getFilesToDownload(projectInfoRemote.files))),
        ),
        taskEither.let('filesToDelete', ({ remoteChanges }) =>
          pipe(remoteChanges, option.map(getFilesToDelete)),
        ),
        // upload local changed files
        taskEither.chainFirstTaskK(({ projectDir, filesToUpload }) =>
          pipe(
            filesToUpload,
            option.fold(
              () => task.of(undefined),
              (filesToUpload) =>
                uploadChangedFiles(
                  `project_${project.value.projectId}_${time.now().getTime()}.tar.br`,
                  project.value.projectId,
                  projectDir,
                  filesToUpload,
                ),
            ),
          ),
        ),
        // download and write added and updated files
        taskEither.chainFirst(({ filesToDownload, projectDir }) =>
          pipe(
            filesToDownload,
            option.foldW(
              () => taskEither.of<SyncException, void>(undefined),
              (filesToDownload) =>
                pipe(
                  filesToDownload,
                  array.traverse(taskEither.ApplicativeSeq)(
                    ({ path, permissions, type, version }) =>
                      writeSingeFile({
                        projectFilePath: path,
                        projectId: project.value.projectId,
                        projectDir,
                        type,
                        version,
                        permissions,
                      }),
                  ),
                  taskEither.map(constVoid),
                ),
            ),
          ),
        ),
        //delete remote removed files
        taskEither.chainFirstTaskK(({ filesToDelete, projectDir }) =>
          pipe(
            filesToDelete,
            option.foldW(
              () => task.of(undefined),
              (filesToDelete) =>
                pipe(
                  filesToDelete,
                  array.traverse(task.ApplicativeSeq)(({ path }) =>
                    deleteSingeFile({
                      projectFilePath: path,
                      projectDir,
                    }),
                  ),
                ),
            ),
          ),
        ),
        // update all project metadata
        taskEither.bindW('updatedProjectInfo', ({ projectDir }) => {
          const hashF = addHash(projectDir);
          return pipe(
            getProjectInfoRemote(project.value.projectId),
            task.chain((projectInfoRemote) =>
              pipe(
                projectInfoRemote.files,
                array.filter(isFile),
                array.traverse(task.ApplicativeSeq)((file) =>
                  pipe(
                    hashF({ path: file.path, type: 'file' }),
                    task.map(({ hash }) => ({ ...file, hash })),
                  ),
                ),
                task.map((files) => ({
                  ...projectInfoRemote,
                  files,
                })),
              ),
            ),
            taskEither.fromTask,
          );
        }),
        // store new state
        taskEither.chainFirstTaskK(({ updatedProjectInfo, projectDirRelative }) =>
          projectRepository.upsertOne(
            projectADT.local({
              ...project.value,
              files: updatedProjectInfo.files,
              basePath: projectDirRelative,
              syncedAt: time.now(),
              syncState: projectADT.fold(project, {
                remote: () => syncStateADT.synced(changesADT.unknown()),
                local: ({ syncState }) => syncState,
              }),
            }),
          ),
        ),
      ),
    [projectRepository, time],
  );
};
