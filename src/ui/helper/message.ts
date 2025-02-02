import { message as antdMessage } from 'antd';
import * as React from 'react';
import {
  Identity,
  Kind,
  Kind2,
  URIS,
  URIS2,
  io,
  naturalTransformation as nt,
  string,
  task,
  taskEither,
} from '@code-expert/prelude';
import { fromThrown } from '@/utils/error';

export type Message<F> = {
  /**
   * Show an error message.
   * If the argument is a string, it is shown.
   * If the argument is an exception, the message is shown.
   * Otherwise, the argument is converted from an error to an exception.
   */
  error(a: unknown, duration?: number): F;
  info(a: Content, duration?: number): F;
  loading(a: Content, duration?: number): F;
  success(a: Content, duration?: number): F;
  warning(a: Content, duration?: number): F;
};

declare module '@code-expert/prelude' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace naturalTransformation {
    interface ServiceKind<F extends URIS> {
      Message: Message<Kind<F, void>>;
    }
    interface ServiceKind2<F extends URIS2, E> {
      Message: Message<Kind2<F, E, void>>;
    }
  }
}

export type Content = React.ReactNode | string;

export type Message1<F extends URIS> = Message<Kind<F, void>>;
export type Message2<F extends URIS2, E> = Message<Kind2<F, E, void>>;

export const messageIO: Message1<io.URI> = {
  error: (e, duration) => () => {
    const message = string.isString(e) || React.isValidElement(e) ? e : fromThrown(e).message;
    return antdMessage.error(message, duration);
  },
  info: (content, duration) => () => void antdMessage.info(content, duration),
  loading: (content, duration) => () => void antdMessage.loading(content, duration),
  success: (content, duration) => () => void antdMessage.success(content, duration),
  warning: (content, duration) => () => void antdMessage.warning(content, duration),
};

export const message: Message1<Identity.URI> = nt.transform<'Message', io.URI, Identity.URI>(
  messageIO,
  io.run,
);

export const messageT: Message1<task.URI> = nt.transform<'Message', io.URI, task.URI>(
  messageIO,
  task.fromIO,
);

export const messageTE = <E>(): Message2<taskEither.URI, E> =>
  nt.transform<'Message', io.URI, taskEither.URI, E>(messageIO, taskEither.fromIO);
