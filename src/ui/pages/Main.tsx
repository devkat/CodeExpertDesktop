import { iots } from '@code-expert/prelude';
import { Button } from 'antd';
import { api } from 'api';
import React, { useState } from 'react';

import { globalAuthState } from '../../domain/AuthState';
import { createSignedAPIRequest } from '../../domain/createSignedAPIRequest';
import { useGlobalContextWithActions } from '../GlobalContext';

export function Main() {
  const [, dispatchContext] = useGlobalContextWithActions();

  const [greetMsg, setGreetMsg] = useState('');
  const [name, setName] = useState('');

  async function greet() {
    const message: string = await api.greet(name);
    setGreetMsg(message);
  }

  async function test() {
    const b = await createSignedAPIRequest({
      path: 'test',
      method: 'GET',
      payload: { test: 2 },
      codec: iots.partial({}),
    });
    console.log(b);
  }

  const onButtonClick = () => {
    dispatchContext({ authState: globalAuthState.notAuthorized() });
  };

  return (
    <div>
      <div className="row">
        <div>
          <input
            id="greet-input"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Enter a name..."
          />
          <button type="button" onClick={() => greet()}>
            Greet
          </button>
          <button type="button" onClick={() => test()}>
            Test
          </button>
          <Button onClick={onButtonClick}>Go back to authorise Code Expert Desktop</Button>
        </div>
      </div>
      <p>{greetMsg}</p>
    </div>
  );
}
