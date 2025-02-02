import { Meta, StoryObj } from '@storybook/react';
import { nonEmptyArray } from '@code-expert/prelude';
import {
  localProject,
  openProject,
  remoteProject,
  removeProject,
  syncProject,
} from '@/ui/pages/projects/components/ProjectList/testData';
import { List } from './List';

const meta = {
  title: 'pages/projects/ProjectList/List',
  component: List,
  args: {
    exerciseName: 'Exercise 8: Two-Dimensional vectors, Characters, Recursion',
    projects: nonEmptyArray.cons(localProject, [remoteProject, localProject]),
    onOpen: openProject,
    onSync: syncProject,
    onRemove: removeProject,
  },
} satisfies Meta<typeof List>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default = {} satisfies Story;

export const Empty = {
  args: {
    projects: [],
  },
} satisfies Story;
