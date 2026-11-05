import { createHash } from 'node:crypto';
import tabela from './tabela.json';
import { AJUSTES_TABELA } from './catalogo';
import { HORAS_NOTURNAS_PADRAO, type OrcamentoEntrada, type PostoCalculado, type Resultado } from './calculo';
import { COR, Documento, moeda, numero, percentual } from './pdf-base';

export type Cliente = { empresa?: string; contato?: string; local?: string; observacoes?: string };

const dataBr = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
/** Código curto e determinístico do orçamento (mesmos dados, mesmo código); não é gravado em lugar nenhum. */
export function referencia(entrada: OrcamentoEntrada, cliente: Cliente) {
  return createHash('sha256').update(JSON.stringify({ entrada, cliente })).digest('hex').slice(0, 6).toUpperCase();
}
const turno = (p: PostoCalculado) => (p.entrada.turno === 'noturno' ? 'Noturno' : 'Diurno');
const nomePosto = (p: PostoCalculado) => `${p.funcao.nome}${p.entrada.periculosidade && !/periculosidade/i.test(p.funcao.nome) ? ' (periculosidade)' : ''}`;
const RODAPE = 'Estimativa gerada pela SINDI (SINDEPRESTEM). Não substitui proposta comercial nem a convenção coletiva vigente.';
const REFERENCIA_CLIENTE = 'tabela de referência de custos de terceirização';

/** Orçamento para o contratante: postos, preço mensal e anual, composição e premissas. */
export async function gerarOrcamentoPdf(entrada: OrcamentoEntrada, r: Resultado, cliente: Cliente = {}) {
  const doc = await Documento.criar('Orçamento estimado de terceirização', RODAPE);
  doc.capa('Orçamento estimado de terceirização', 'Mão de obra terceirizada · estimativa mensal e anual', `Emitido em ${dataBr()} · Ref. ${referencia(entrada, cliente)}`);
  doc.campos([['Empresa', cliente.empresa ?? ''], ['Contato', cliente.contato ?? ''], ['Local da prestação', cliente.local ?? ''], ['Área (m²)', entrada.metrosQuadrados ? numero(entrada.metrosQuadrados) : '']]);
  doc.destaques([
    { rotulo: 'Valor mensal estimado', valor: moeda(r.valorContrato), principal: true }, { rotulo: 'Valor em 12 meses', valor: moeda(r.valorAnual) },
    { rotulo: 'Médio por funcionário', valor: moeda(r.precoMedioFuncionario) },
    ...(r.precoPorMetro !== null ? [{ rotulo: 'Preço por m²', valor: moeda(r.precoPorMetro) }] : []),
  ]);
  doc.titulo2('Postos de trabalho');
  const linhas = r.postos.map(p => [nomePosto(p), turno(p), numero(p.quantidade), moeda(p.valorPorFuncionario), moeda(p.valorMensal)]);
  linhas.push(['Total', '', numero(r.funcionarios), moeda(r.precoMedioFuncionario), moeda(r.valorContrato)]);
  doc.tabela([{ titulo: 'Função', largura: 190 }, { titulo: 'Turno', largura: 60 }, { titulo: 'Qtde', largura: 40, alinhar: 'direita' }, { titulo: 'Mensal por funcionário', largura: 112, alinhar: 'direita' }, { titulo: 'Mensal do posto', largura: 109, alinhar: 'direita' }],
    linhas, { negrito: new Set([linhas.length - 1]), destaque: new Set([linhas.length - 1]) });
  if (r.insumos.length) {
    doc.titulo2('Materiais, equipamentos e serviços incluídos');
    doc.tabela([{ titulo: 'Item', largura: 300 }, { titulo: 'Qtde', largura: 50, alinhar: 'direita' }, { titulo: 'Custo mensal', largura: 161, alinhar: 'direita' }],
      r.insumos.map(i => [`${i.nome} (${i.titulo})`, numero(i.quantidade), moeda(i.custoMensal)]));
  }
  doc.titulo2('Composição do preço mensal');
  const valor = r.valorContrato || 1; const mostrar = (rotulo: string, v: number) => ({ rotulo, valor: v, texto: `${percentual(v / valor, 1)}  ${moeda(v)}` });
  doc.barras([
    mostrar('Salários e adicionais', r.folha.subtotal), mostrar('Encargos sociais e trabalhistas', r.encargosValor), mostrar('Benefícios (VR, VT, cesta, seguro)', r.beneficios.subtotal),
    mostrar('PCMSO e PPR', r.outros.subtotal), mostrar('Uniformes, EPIs e insumos', r.materiais.subtotal), mostrar('Tributos, BDI e lucro', r.valorContrato - r.custoTotal),
  ]);
  doc.titulo2('O que está incluído');
  doc.marcadores([
    `Salários conforme a tabela de referência, com os adicionais da função e do turno (adicional noturno de ${percentual(tabela.parametros.adicionalNoturno, 0)} com descanso semanal remunerado, quando noturno).`,
    `Encargos sociais e trabalhistas (${percentual(r.taxaEncargos)} sobre a folha): contribuições, férias, 13º salário, ausências, aviso prévio e FGTS.`,
    'Benefícios: vale-refeição, vale-transporte (líquido do desconto do empregado), cesta básica, assistência social familiar e seguro de vida.',
    'PCMSO/PPR, uniformes e equipamentos de proteção individual (EPIs) das funções.',
    `Tributos sobre o faturamento (ISS ${percentual(r.tributos.taxas.ISS, 2)}, PIS, COFINS, contribuição social e IRPJ), BDI de ${percentual(tabela.parametros.bdi, 0)} e lucro de ${percentual(tabela.parametros.lucro, 0)}.`,
  ]);
  doc.titulo2('Premissas e avisos');
  const noturnos = r.postos.filter(p => p.entrada.turno === 'noturno');
  doc.marcadores([
    `Base de cálculo: ${REFERENCIA_CLIENTE} (posição de ${tabela.meta.extraidoEm.split('-').reverse().join('/')}). ${tabela.meta.observacao}`,
    ...(noturnos.length ? [`Turno noturno: ${numero(noturnos[0].entrada.horasNoturnas ?? HORAS_NOTURNAS_PADRAO)} horas noturnas por funcionário por mês, calculadas sobre o salário-hora (salário ÷ 220).`] : []),
    'Valores mensais, sem reajuste. Dissídio, mudanças na convenção coletiva da categoria, alíquota de ISS do município e escopo efetivo podem alterar o preço.',
    'Esta é uma estimativa para planejamento e comparação de propostas. Não é proposta comercial, contrato nem parecer jurídico ou contábil.',
    ...(cliente.observacoes ? [`Observações do solicitante: ${cliente.observacoes}`] : []),
  ], 8.5);
  return doc.bytes();
}

const parc = (rotulo: string, v: number, total: number): string[] => [rotulo, moeda(v), percentual(total ? v / total : 0)];

/** Relatório de custo: memória de cálculo por posto, estrutura consolidada, encargos com base legal e parâmetros usados. */
export async function gerarRelatorioCustoPdf(entrada: OrcamentoEntrada, r: Resultado, cliente: Cliente = {}) {
  const doc = await Documento.criar('Relatório de custo — composição detalhada', RODAPE);
  doc.capa('Relatório de custo', 'Composição detalhada da mão de obra terceirizada', `Emitido em ${dataBr()} · Ref. ${referencia(entrada, cliente)}`);
  doc.campos([['Empresa', cliente.empresa ?? ''], ['Contato', cliente.contato ?? ''], ['Local da prestação', cliente.local ?? ''], ['Área (m²)', entrada.metrosQuadrados ? numero(entrada.metrosQuadrados) : '']]);
  doc.destaques([{ rotulo: 'Custo total (sem tributos e margem)', valor: moeda(r.custoTotal) }, { rotulo: 'Valor mensal do contrato', valor: moeda(r.valorContrato), principal: true }, { rotulo: 'Funcionários', valor: numero(r.funcionarios) }]);

  doc.titulo2('1. Resumo dos postos');
  const linhas = r.postos.map(p => [nomePosto(p), turno(p), numero(p.quantidade), moeda(p.funcao.salario), moeda(p.custoPorFuncionario), moeda(p.valorMensal)]);
  doc.tabela([{ titulo: 'Função', largura: 160 }, { titulo: 'Turno', largura: 50 }, { titulo: 'Qtde', largura: 34, alinhar: 'direita' }, { titulo: 'Salário base', largura: 80, alinhar: 'direita' }, { titulo: 'Custo direto por func.', largura: 95, alinhar: 'direita' }, { titulo: 'Preço mensal do posto', largura: 92, alinhar: 'direita' }], linhas);

  doc.titulo2('2. Memória de cálculo por funcionário');
  for (const p of r.postos) {
    const f = p.porFuncionario; const itens: [string, number][] = [
      ['Salário base', f.salario], ['Periculosidade', f.periculosidade], ['Insalubridade', f.insalubridade], ['Adicional noturno + DSR', f.adicionalNoturno], ['Horas extras + DSR', f.horasExtras],
      [`Subtotal da folha`, f.folha], [`Encargos sociais (${percentual(r.taxaEncargos)})`, f.encargos], ['Cesta básica', f.cestaBasica], ['Vale-refeição', f.valeRefeicao], ['Vale-transporte (líquido)', f.valeTransporte],
      ['Assistência social familiar', f.assistenciaSocial], ['Seguro de vida', f.seguroVida], ['Assistência médica', f.assistenciaMedica], ['PCMSO', f.pcmso], ['PPR', f.ppr], ['Uniformes', f.uniformes], ['EPIs', f.epis],
    ];
    const visiveis = itens.filter(([nome, v]) => v > 0 || nome === 'Salário base');
    visiveis.push(['Custo direto por funcionário', p.custoPorFuncionario]);
    doc.texto(`${nomePosto(p)} — ${turno(p)} — ${numero(p.quantidade)} funcionário(s)`, { negrito: true, tamanho: 9.5, espaco: 2 });
    const destaque = new Set<number>([visiveis.length - 1]); const negrito = new Set<number>([visiveis.findIndex(([n]) => n === 'Subtotal da folha'), visiveis.length - 1].filter(i => i >= 0));
    doc.tabela([{ titulo: 'Item (por funcionário, por mês)', largura: 311 }, { titulo: 'Valor', largura: 100, alinhar: 'direita' }, { titulo: 'Total do posto', largura: 100, alinhar: 'direita' }],
      visiveis.map(([nome, v]) => [nome, moeda(v), moeda(v * p.quantidade)]), { destaque, negrito });
  }

  doc.titulo2('3. Estrutura consolidada do contrato (mensal)');
  const t = r.valorContrato; const rows: string[][] = []; const negrito = new Set<number>(); const destaque = new Set<number>();
  const secao = (titulo: string, itens: string[][], subtotal: number) => { rows.push([titulo.toUpperCase(), '', '']); negrito.add(rows.length - 1); rows.push(...itens); rows.push(parc('Subtotal', subtotal, t)); negrito.add(rows.length - 1); };
  secao('Folha de pagamento', [parc('Salários', r.folha.salarios, t), parc('Horas extras', r.folha.horasExtras, t), parc('Adicional noturno', r.folha.adicionalNoturno, t), parc('Insalubridade', r.folha.insalubridade, t), parc('Periculosidade', r.folha.periculosidade, t)], r.folha.subtotal);
  secao('Encargos sociais sobre a folha', [parc(`Encargos (${percentual(r.taxaEncargos)})`, r.encargosValor, t)], r.encargosValor);
  secao('Benefícios garantidos em convenção e CLT', [parc('Cesta básica', r.beneficios.cestaBasica, t), parc('Vale-refeição', r.beneficios.valeRefeicao, t), parc('Assistência médica', r.beneficios.assistenciaMedica, t), parc('Assistência social familiar', r.beneficios.assistenciaSocial, t), parc('Seguro de vida', r.beneficios.seguroVida, t), parc('Vale-transporte', r.beneficios.valeTransporte, t)], r.beneficios.subtotal);
  secao('Outros benefícios e despesas', [parc('PCMSO/PPR', r.outros.pcmsoPpr, t), parc('SEAC', r.outros.seac, t), parc('Contribuição assistencial patronal', r.outros.contribuicaoPatronal, t)], r.outros.subtotal);
  secao('Materiais e equipamentos', [parc('Uniformes', r.materiais.uniformes, t), parc('EPIs e EPCs', r.materiais.epis, t), parc('Insumos, equipamentos e serviços', r.materiais.insumos, t)], r.materiais.subtotal);
  rows.push(parc('CUSTO TOTAL DOS SERVIÇOS', r.custoTotal, t)); negrito.add(rows.length - 1); destaque.add(rows.length - 1);
  rows.push(['TRIBUTOS, BDI E LUCRO (sobre o faturamento)', '', '']); negrito.add(rows.length - 1);
  for (const [nome, taxa] of Object.entries(r.tributos.taxas)) rows.push([`${nome} (${percentual(taxa)})`, moeda(t * taxa), percentual(taxa)]);
  rows.push(parc('Total de tributos, BDI e lucro', t - r.custoTotal, t)); negrito.add(rows.length - 1);
  rows.push(parc('VALOR TOTAL DO CONTRATO', t, t)); negrito.add(rows.length - 1); destaque.add(rows.length - 1);
  doc.tabela([{ titulo: 'Descrição', largura: 311 }, { titulo: 'Valor mensal', largura: 100, alinhar: 'direita' }, { titulo: '% s/ faturamento', largura: 100, alinhar: 'direita' }], rows, { negrito, destaque, zebra: false });
  doc.texto(`Preço = custo total ÷ (1 − ${percentual(r.tributos.somaTaxas)}): os tributos, o BDI e o lucro incidem sobre o valor faturado, como na planilha de referência.`, { tamanho: 8, cor: COR.suave });

  if (r.insumos.length) {
    doc.titulo2('4. Insumos, equipamentos e serviços');
    doc.tabela([{ titulo: 'Item', largura: 280 }, { titulo: 'Qtde', largura: 40, alinhar: 'direita' }, { titulo: 'Valor unitário', largura: 95, alinhar: 'direita' }, { titulo: 'Custo mensal', largura: 96, alinhar: 'direita' }],
      r.insumos.map(i => [`${i.nome} (${i.titulo})`, numero(i.quantidade), moeda(i.valorUnitario), moeda(i.custoMensal)]));
  }

  doc.titulo2(`${r.insumos.length ? 5 : 4}. Encargos sociais e trabalhistas`);
  for (const grupo of r.encargos.grupos) {
    doc.tabela([{ titulo: grupo.titulo, largura: 230 }, { titulo: 'Taxa', largura: 61, alinhar: 'direita' }, { titulo: 'Fundamentação legal', largura: 220 }],
      [...grupo.linhas.map(l => [l.nome, percentual(l.taxa, 3), l.baseLegal ?? '']), ['Total do grupo', percentual(grupo.total, 3), '']], { negrito: new Set([grupo.linhas.length]), tamanho: 8 });
  }
  doc.texto(`Total de encargos: ${percentual(r.encargos.total, 4)} sobre a folha de pagamento. Dias úteis trabalhados por ano: ${numero(r.encargos.dias.uteisAno, 2)}.`, { negrito: true, tamanho: 9 });

  const p = tabela.parametros;
  doc.titulo2(`${r.insumos.length ? 6 : 5}. Parâmetros utilizados`);
  doc.tabela([{ titulo: 'Parâmetro', largura: 311 }, { titulo: 'Valor', largura: 200, alinhar: 'direita' }], [
    ['Salário mínimo (base da insalubridade)', moeda(p.salarioMinimo)], ['Cesta básica (mensal)', moeda(p.cestaBasica)], ['Vale-refeição (diário × dias)', `${moeda(p.valeRefeicaoDia)} × ${p.diasValeRefeicao}`],
    ['Vale-transporte (unitário × viagens × dias)', `${moeda(p.valeTransporteUnitario)} × ${p.viagensPorDia} × ${p.diasValeTransporte}`], ['Desconto do empregado no vale-transporte', percentual(p.descontoValeTransporte, 0)],
    ['Assistência social familiar (mensal)', moeda(p.assistenciaSocialFamiliar)], ['Seguro de vida (mensal)', moeda(p.seguroVida)], ['PCMSO (mensal)', moeda(p.pcmso)], ['PPR (mensal)', moeda(p.ppr)],
    ['Adicional noturno', percentual(p.adicionalNoturno, 0)], ['DSR sobre adicionais', `${p.dsr.diasDescanso}/${p.dsr.diasUteis}`], ['BDI / lucro', `${percentual(p.bdi, 0)} / ${percentual(p.lucro, 0)}`],
    ['ISS / PIS / COFINS / CSLL / IRPJ', `${percentual(r.tributos.taxas.ISS)} / ${percentual(p.impostos.pis)} / ${percentual(p.impostos.cofins)} / ${percentual(p.impostos.contribuicaoSocial)} / ${percentual(p.impostos.irpj)}`],
  ]);
  doc.titulo2('Observações sobre a tabela de referência');
  doc.marcadores([`Fonte: ${tabela.meta.origem}. ${tabela.meta.observacao}`, ...AJUSTES_TABELA, 'O salário mínimo da planilha é usado apenas na insalubridade; as funções de limpeza seguem a convenção coletiva da categoria de asseio e conservação, que não é a do SINDEPRESTEM.'], 8.5);
  return doc.bytes();
}
