import React from 'react';
import Lancamentos from './Lancamentos';

export default function Pagar() {
  return (
    <Lancamentos
      typeOverride="saida"
      titleOverride="Contas a Pagar"
      statusAprovacaoOverride="fila_operacional"
    />
  );
}
