import { Story } from '@storybook/react';
import React from 'react';
import { adt, either, pipe, remoteEither, taskEither } from '@code-expert/prelude';
import { useRemoteEither } from './useRemoteData';

const foldMeteorCallType = adt.foldFromKeys({ resolve: null, reject: null, throw: null });
type MeteorCallType = adt.TypeOfKeys<typeof foldMeteorCallType>;

function mockMethodCall(type: MeteorCallType): taskEither.TaskEither<string, string> {
  return () =>
    new Promise((resolve, reject) => {
      foldMeteorCallType(type, {
        resolve: () => {
          setTimeout(() => resolve(either.right(`resolve ${Math.random()}`)), 1000);
        },
        reject: () => {
          setTimeout(() => reject(either.left(`reject ${Math.random()}`)), 1000);
        },
        throw: () => {
          either.left(`throw ${Math.random()}`);
        },
      });
    });
}

// -----------------------------------------------------------------------------

interface UseRemoteEitherTestProps {
  type: MeteorCallType;
  useRemoteEitherHook: typeof useRemoteEither;
}

function UseRemoteEitherTest({ type, useRemoteEitherHook }: UseRemoteEitherTestProps) {
  const [rd, refresh] = useRemoteEitherHook(mockMethodCall);
  return (
    <div>
      {pipe(
        rd,
        remoteEither.match(
          () => <div>[Initial]</div>,
          () => <div>[Loading]</div>,
          (e) => <div>[Error] {e}</div>,
          (x) => <div>[Success] {x}</div>,
        ),
      )}
      <button type="button" onClick={() => refresh(type)}>
        {remoteEither.isInitial(rd) || remoteEither.isPending(rd) ? 'Fetch' : 'Refresh'}
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------

export default {
  title: 'hooks/useRemoteEither',
  component: UseRemoteEitherTest,
};

const Template: Story<{ type: MeteorCallType }> = ({ type = 'resolve' }) => (
  <UseRemoteEitherTest type={type} useRemoteEitherHook={useRemoteEither} />
);

export const Resolve = Template.bind({});
Resolve.args = {};

export const Reject = Template.bind({});
Reject.args = {
  type: 'reject',
};

export const Throw = Template.bind({});
Throw.args = {
  type: 'throw',
};
