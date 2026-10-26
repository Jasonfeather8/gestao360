import React from 'react';
import Lancamentos from './Lancamentos';

export default function Receber() {
  return (
    <Lancamentos
      typeOverride="entrada"
      titleOverride="Contas a Receber"
      statusAprovacaoOverride="fila_operacional"
    />
  );
}
