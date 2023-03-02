import React from 'react';
import { Button, Result } from 'antd';
import { api } from 'api';
import { AppId } from '../../domain/AppId';
import { GuardRemoteData } from '../components/GuardRemoteData';
import { option, pipe, task } from '../../prelude';
import { useAsync } from '../hooks/useAsync';
import { EntityNotFoundException } from '../../domain/exception';
import { digestMessage, pkceChallenge } from '../../utils/crypto';

function NotAuthorized() {
  const { code_verifier, code_challenge } = pkceChallenge();
  const appIdentifier = useAsync(
    () =>
      pipe(
        api.settingRead('appId', AppId),
        task.map(
          option.getOrThrow(
            () =>
              new EntityNotFoundException(
                {},
                'No app id was found. Please contact the developers.',
              ),
          ),
        ),
        task.run,
      ),
    [],
  );

  const onButtonClick = () => {
    sessionStorage.setItem('pkceVerifier', code_verifier);
    //todo redirect to wait for authorization page
    console.log('button clicked');
  };

  return (
    <GuardRemoteData
      value={appIdentifier}
      render={(appIdentifier) => (
        <Result
          title="Code Expert Desktop is not authorized"
          subTitle="To authorize click the button below and authorize the Code Expert Desktop App in Code Expert"
          extra={
            <Button
              type="primary"
              href={`http://localhost:3000/app/authorize?appIdentifier=${digestMessage(
                appIdentifier,
              )}&code_challenge=${code_challenge}`}
              onClick={onButtonClick}
              target="_blank"
            >
              Authorize Code Expert Desktop
            </Button>
          }
        />
      )}
    />
  );
}

export default NotAuthorized;
