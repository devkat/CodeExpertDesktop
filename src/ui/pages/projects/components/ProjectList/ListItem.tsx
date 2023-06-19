import { Alert, Button, List } from 'antd';
import React from 'react';
import { constNull, remoteData, task, taskEither } from '@code-expert/prelude';
import { Project, ProjectId, projectADT } from '@/domain/Project';
import { ActionMenu } from '@/ui/components/ActionMenu';
import { GuardRemoteEitherData } from '@/ui/components/GuardRemoteData';
import { useTimeContext } from '@/ui/contexts/TimeContext';
import { Icon } from '@/ui/foundation/Icons';
import { HStack, VStack } from '@/ui/foundation/Layout';
import { styled } from '@/ui/foundation/Theme';
import { useRemoteData2, useRemoteDataEither } from '@/ui/hooks/useRemoteData';
import { fromProject } from '@/ui/pages/projects/components/ProjectList/model/SyncButtonState';
import { SyncButton } from './SyncButton';

const StyledListItem = styled(List.Item, () => ({
  position: 'relative',
  paddingInline: '0 !important',
  alignItems: 'start !important',
}));

const StyledButton = styled(Button, ({ tokens }) => ({
  whiteSpace: 'normal',
  padding: 0,
  textAlign: 'left',
  height: 'auto',
  paddingBlock: 2,
  '&.ant-btn': {
    color: tokens.colorText,
    '&:hover': {
      color: tokens.colorLink,
    },
    '&:active': {
      color: tokens.colorLinkActive,
    },
    '&:disabled': {
      color: tokens.colorTextDisabled,
      cursor: 'wait',
    },
  },
}));

export interface ListItemProps {
  project: Project;
  onOpen(id: ProjectId): taskEither.TaskEither<string, void>;
  onSync(id: ProjectId): taskEither.TaskEither<string, void>;
  onRemove(id: ProjectId): task.Task<void>;
}

export const ListItem = ({ project, onOpen, onSync, onRemove }: ListItemProps) => {
  const { now } = useTimeContext();

  const [openStateRD, runOpen] = useRemoteDataEither(onOpen);
  const [syncStateRD, runSync] = useRemoteDataEither(onSync);
  const [removalStateRD, runRemove] = useRemoteData2(onRemove);

  // All states combined. Order matters: the first failure gets precedence.
  const actionStates = remoteData.sequenceT(openStateRD, syncStateRD);

  const syncButtonState = fromProject(project, remoteData.isPending(syncStateRD));

  return (
    <StyledListItem>
      <VStack fill gap={'xs'}>
        <HStack justify={'space-between'}>
          <StyledButton
            type={'link'}
            block
            onClick={() => runOpen(project.value.projectId)}
            disabled={remoteData.isPending(openStateRD)}
          >
            {project.value.taskName}
          </StyledButton>
          <HStack gap={'xxs'} align={'start'}>
            <SyncButton
              now={now}
              state={syncButtonState}
              onClick={() => runSync(project.value.projectId)}
            />
            <ActionMenu
              label={'Actions'}
              menu={{
                items: [
                  {
                    label: 'Open directory',
                    key: 'open',
                    disabled: projectADT.is.remote(project),
                    icon: <Icon name="folder-open-regular" />,
                    onClick: () => runOpen(project.value.projectId),
                  },
                  {
                    label: 'Sync to local computer',
                    key: 'sync',
                    icon: <Icon name="sync" />,
                    onClick: () => runSync(project.value.projectId),
                  },
                  { type: 'divider' },
                  {
                    label: 'Remove',
                    key: 'remove',
                    icon: <Icon name="trash" />,
                    danger: true,
                    disabled: remoteData.isPending(removalStateRD),
                    onClick: () => runRemove(project.value.projectId),
                  },
                ],
              }}
            />
          </HStack>
        </HStack>
        <GuardRemoteEitherData
          value={actionStates}
          render={constNull}
          pending={constNull}
          failure={(err) => <Alert type={'warning'} description={err} />}
        />
      </VStack>
    </StyledListItem>
  );
};