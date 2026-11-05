"""Extrai a tabela de preços e os parâmetros de encargos da planilha de terceirização para src/lib/orcamento/tabela.json.

Uso: python scripts/dados/extrair-tabela-orcamento.py "caminho/02 TERCEIRIZAÇÃO ATUALIZADA.xlsx"
Requer openpyxl. Os valores vêm das células (não das fórmulas); o motor de cálculo (src/lib/orcamento/calculo.ts) reimplementa as fórmulas.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

import openpyxl

origem = Path(sys.argv[1])
wb = openpyxl.load_workbook(origem, data_only=True)
ins = wb["Inserção de dados"]
enc = wb["Encargos Sociais"]


def num(cell):
    value = ins[cell].value
    return float(value) if isinstance(value, (int, float)) else None


def slug(text):
    text = re.sub(r"[^a-z0-9]+", "-", text.lower().replace("ç", "c").replace("ã", "a").replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ô", "o").replace("ú", "u").replace("â", "a").replace("ê", "e"))
    return text.strip("-")


# Funções: linhas 29 a 51 (nome em B, salário em E, periculosidade em I, insalubridade em J).
# Uniformes: linhas 83 a 105 na mesma ordem (preço em C, peças por funcionário em D, meses em E).
funcoes = []
for offset in range(23):
    row = 29 + offset
    nome = ins[f"B{row}"].value
    if not nome:
        continue
    uniforme_row = 83 + offset
    salario = num(f"E{row}")
    funcoes.append({
        "id": slug(nome),
        "nome": nome.title().replace(" De ", " de ").replace(" Em ", " em ").replace(" Do ", " do ").replace(" Da ", " da ").replace(" E ", " e ").replace(" C/ ", " c/ ").replace("Bombeiro Civil", "Bombeiro civil"),
        "nomeOriginal": nome,
        "salario": salario,
        "divisorHoras": 180 if "BOMBEIRO" in nome else 220,
        "periculosidade": num(f"I{row}") or 0,
        "insalubridade": num(f"J{row}") or 0,
        "uniforme": {"unitario": num(f"C{uniforme_row}"), "quantidade": num(f"D{uniforme_row}"), "meses": num(f"E{uniforme_row}")},
        "epis": [],
    })

# EPIs: coluna G (descrição "Função - item") e I (valor unitário) nas linhas 83 a 181.
kits = {}
for row in range(83, 182):
    descricao = ins[f"G{row}"].value
    valor = num(f"I{row}")
    if not descricao or valor is None:
        continue
    grupo, _, item = descricao.partition(" - ")
    kits.setdefault(grupo.strip(), []).append({"descricao": item.strip(), "valor": valor})

parametros = {
    "salarioMinimo": num("I9"),
    "ppr": num("I10"),
    "cestaBasica": num("I11"),
    "valeRefeicaoDia": num("I12"), "diasValeRefeicao": num("K12"),
    "assistenciaSocialFamiliar": num("I13"),
    "seguroVida": num("I14"),
    "pcmso": num("I15"),
    "assistenciaMedica": num("I16") or 0,
    "valeTransporteUnitario": num("I17"), "diasValeTransporte": num("K17"), "viagensPorDia": num("M17"),
    "descontoValeTransporte": num("K18"),
    "seac": num("I18") or 0,
    "contribuicaoAssistencialPatronal": num("I19") or 0,
    "bdi": num("C23"), "lucro": num("C24"),
    "impostos": {"iss": num("C13"), "pis": num("C14"), "cofins": num("C15"), "contribuicaoSocial": num("C16"), "irpj": num("C17")},
    "adicionalNoturno": 0.2,
    "dsr": {"diasDescanso": 8, "diasUteis": 22},
}


def val(cell):
    value = enc[cell].value
    return float(value) if isinstance(value, (int, float)) else None


encargos = {
    "grupoA": [(enc[f"B{r}"].value.strip(), val(f"C{r}"), enc[f"D{r}"].value) for r in range(3, 12)],
    "parametros": {
        "diasAno": val("G14"), "domingosAno": val("G16"), "sabadosAno": val("G17") or 0, "feriadosAno": val("G18"),
        "faltasJustificadas": val("G19"), "faltasAtestado": val("G20"),
        "acidenteTrabalho": 12.3819 * 0.00744, "auxilioPaternidade": 0.02 * 4 * 0.4,
        "avisoPrevioTrabalhadoDias": 5.77, "representacaoSindical": val("G25"), "treinamento": val("G26"),
        "diasDecimoTerceiro": val("G30"),
        "avisoPrevioIndenizadoPct": val("G33"), "avisoPrevioTrabalhadoPct": val("G34"),
        "demitidosSemJustaCausa": val("G36"), "demitidosAte30Dias": val("G38"), "permanenciaMeses": val("G39"),
        "maternidadeBase": {"dias": 120, "participacao": 0.5293, "taxa": 0.02, "licenca": 0.6},
    },
    "grupoD": {"grupoAsobreB": val("C36"), "incidenciasSalarioMaternidade": val("C37")},
    "baseLegal": {enc[f"B{r}"].value.strip(): enc[f"D{r}"].value for r in list(range(14, 24)) + list(range(27, 34)) if enc[f"B{r}"].value and enc[f"D{r}"].value},
    "totalPlanilha": val("C39"),
}
encargos["grupoA"] = [{"nome": n, "taxa": t, "baseLegal": b} for n, t, b in encargos["grupoA"]]


def tabela_itens(rows, nome_col, valor_col, qtd_extra=None):
    itens = []
    for row in rows:
        nome = ins[f"{nome_col}{row}"].value
        valor = num(f"{valor_col}{row}")
        if not nome or nome == "-" or valor is None:
            continue
        item = {"id": slug(str(nome)), "nome": str(nome).strip(), "valor": valor}
        if qtd_extra:
            for chave, col in qtd_extra.items():
                item[chave] = num(f"{col}{row}") or 0
        itens.append(item)
    return itens


catalogo = {
    "quimicos": tabela_itens(range(187, 208), "B", "E"),
    "materiaisDiversos": tabela_itens(range(227, 238), "B", "E"),
    "equipamentosLimpeza": tabela_itens(range(187, 225), "H", "K", {"depreciacaoMeses": "L", "manutencaoAno": "M"}),
    "jardinagemMateriais": tabela_itens(range(240, 245), "B", "E"),
    "jardinagemEquipamentos": tabela_itens(range(227, 237), "H", "K", {"depreciacaoMeses": "L", "manutencaoAno": "M"}),
    "manutencaoEquipamentos": tabela_itens(range(240, 249), "H", "K", {"depreciacaoMeses": "L", "manutencaoAno": "M"}),
    "informaticaComunicacao": tabela_itens(range(254, 261), "H", "K", {"depreciacaoMeses": "L", "manutencaoAno": "M"}),
    "veiculos": tabela_itens(range(263, 265), "H", "K", {"depreciacaoMeses": "L", "manutencaoAno": "M"}),
    "combustivel": tabela_itens(range(248, 251), "B", "E"),
    "servicosContratados": tabela_itens(range(254, 259), "B", "E"),
    "piscina": tabela_itens(range(263, 264), "B", "E"),
}

saida = {
    "meta": {"origem": origem.name, "extraidoEm": date.today().isoformat(), "observacao": "Valores de referência da planilha; confirmar vigência e convenção coletiva da categoria antes de contratar."},
    "parametros": parametros,
    "encargos": encargos,
    "funcoes": funcoes,
    "kitsEpi": kits,
    "catalogo": catalogo,
}
destino = Path(__file__).resolve().parent.parent / "src" / "lib" / "orcamento" / "tabela.json"
destino.parent.mkdir(parents=True, exist_ok=True)
destino.write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
print("gravado", destino, "funções:", len(funcoes), "com salário:", sum(1 for f in funcoes if f["salario"]), "kits:", list(kits))
