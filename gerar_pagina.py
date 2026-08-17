# -*- coding: utf-8 -*-
"""
Gera a pagina de consulta 'Disposicao de Acessorios' a partir da planilha
CONTROLE DISPOSICAO DE ACESSORIOS.xlsx.

Uso:
    python gerar_pagina.py

Saida:
    disposicao.html  (arquivo unico, sem dependencias externas)

A planilha e apenas LIDA - nunca gravada.
"""

import io
import json
import os
import re
import sys
from datetime import datetime

import openpyxl

AQUI = os.path.dirname(os.path.abspath(__file__))

PLANILHA = r"I:\Meu Drive\CONTROLE COMPRAS\CONTROLE DISPOSIÇÃO DE ACESSÓRIOS.xlsx"
TEMPLATE = os.path.join(AQUI, "template.html")
QRJS = os.path.join(AQUI, "qr.js")
SAIDA = os.path.join(AQUI, "index.html")
SAIDA_ARTIFACT = os.path.join(AQUI, "artifact.html")

# Envolve o conteudo num documento completo (necessario para abrir como
# arquivo local ou hospedar em qualquer servidor). A versao 'artifact.html'
# vai sem isso porque a plataforma injeta o proprio cabecalho.
MOLDURA = u"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
</head>
<body>
%s
</body>
</html>
"""

ABA_SALDO = "SALDO TOTAL DE ACESSÓRIOS"
RE_ARMARIO = re.compile(r"^ARM[ÁA]RIO\s+(\d+)$", re.IGNORECASE)


def texto(v):
    """Converte celula em texto limpo, sem o '.0' de refs numericas."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def inteiro(v):
    if v is None or v == "":
        return None
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def ler_conferencia(wb):
    """Mapa ref -> {sistema, dif, status} a partir da aba de saldo total."""
    conf = {}
    resumo = {"refs": 0, "fisico": 0, "sistema": 0, "dif": 0}
    if ABA_SALDO not in wb.sheetnames:
        return conf, resumo

    ws = wb[ABA_SALDO]
    for row in ws.iter_rows(min_row=2, values_only=True):
        ref = texto(row[0])
        if not ref:
            continue
        if ref.upper() == "TOTAL GERAL":
            resumo["fisico"] = inteiro(row[13]) or 0
            resumo["sistema"] = inteiro(row[14]) or 0
            resumo["dif"] = inteiro(row[15]) or 0
            continue
        conf[ref] = {
            "sistema": inteiro(row[14]),
            "dif": inteiro(row[15]),
            "status": texto(row[16]) or None,
        }
    resumo["refs"] = len(conf)
    return conf, resumo


def ler_armarios(wb, conf):
    armarios = []
    for nome in wb.sheetnames:
        m = RE_ARMARIO.match(nome.strip())
        if not m:
            continue
        n = int(m.group(1))
        ws = wb[nome]
        itens = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            ref = texto(row[0])
            qtd = inteiro(row[1])
            desc = texto(row[2])
            prat = inteiro(row[3])
            if not ref or qtd is None:
                continue
            c = conf.get(ref, {})
            itens.append({
                "ref": ref,
                "qtd": qtd,
                "desc": desc or "(sem descrição)",
                "prat": prat if prat is not None else 0,
                "sistema": c.get("sistema"),
                "dif": c.get("dif"),
                "status": c.get("status"),
            })

        # marca refs que aparecem em mais de uma prateleira do mesmo armario
        totais = {}
        for it in itens:
            totais[it["ref"]] = totais.get(it["ref"], 0) + it["qtd"]
        for it in itens:
            repetida = sum(1 for x in itens if x["ref"] == it["ref"]) > 1
            it["multi"] = repetida
            it["refTotal"] = totais[it["ref"]]

        itens.sort(key=lambda x: (x["prat"], x["desc"]))
        armarios.append({"n": n, "itens": itens})

    armarios.sort(key=lambda a: a["n"])
    return armarios


def main():
    if not os.path.exists(PLANILHA):
        sys.exit("Planilha nao encontrada:\n  %s" % PLANILHA)

    wb = openpyxl.load_workbook(PLANILHA, data_only=True, read_only=True)
    try:
        conf, resumo = ler_conferencia(wb)
        armarios = ler_armarios(wb, conf)
    finally:
        wb.close()

    if not armarios:
        sys.exit("Nenhuma aba 'ARMARIO n' encontrada na planilha.")

    gerado = datetime.now().strftime("%d/%m/%Y")
    dados = {"gerado": gerado, "armarios": armarios, "resumo": resumo}

    with io.open(TEMPLATE, encoding="utf-8") as f:
        html = f.read()
    with io.open(QRJS, encoding="utf-8") as f:
        qrjs = f.read()

    html = html.replace("/*{{QRJS}}*/", qrjs)
    html = html.replace("/*{{DADOS}}*/", json.dumps(dados, ensure_ascii=False))
    html = html.replace("/*{{GERADO}}*/", gerado)

    with io.open(SAIDA, "w", encoding="utf-8") as f:
        f.write(MOLDURA % html)
    with io.open(SAIDA_ARTIFACT, "w", encoding="utf-8") as f:
        f.write(html)

    total_itens = sum(len(a["itens"]) for a in armarios)
    total_pecas = sum(it["qtd"] for a in armarios for it in a["itens"])
    print("Pagina gerada: %s" % SAIDA)
    print("Versao publicavel: %s" % SAIDA_ARTIFACT)
    print("  armarios: %d" % len(armarios))
    print("  linhas:   %d" % total_itens)
    print("  pecas:    %d" % total_pecas)
    print("  refs conferidas: %d" % resumo["refs"])


if __name__ == "__main__":
    main()
