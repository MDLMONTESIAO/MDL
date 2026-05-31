#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Downloader pessoal de cifras do BananaCifras.

Baixa as cifras de um ou mais artistas para acervo/cifras_multi e, por
padrao, chama o sincronizador que importa o acervo e envia ao GitHub.
"""

import argparse
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager


ROOT = Path(__file__).resolve().parents[1]
BASE_DIR = ROOT / "acervo" / "cifras_multi"
BASE_URL = "https://www.bananacifras.com"
DELAY_ENTRE_MUSICAS = 2
DELAY_ENTRE_ARTISTAS = 5
MAX_TENTATIVAS = 2


def main():
    args = parse_args()
    artistas = parse_artistas(args.artistas)
    if not artistas:
        print("Nenhum artista informado.")
        return 1

    print("Iniciando downloader BananaCifras")
    print(f"Pasta de destino: {BASE_DIR}")

    driver = setup_driver(args.headless)
    try:
        for index, artista in enumerate(artistas, 1):
            processar_artista(driver, artista, index, len(artistas))
            if index < len(artistas):
                print(f"Pausa entre artistas ({DELAY_ENTRE_ARTISTAS}s)...")
                time.sleep(DELAY_ENTRE_ARTISTAS)
    finally:
        driver.quit()

    print("Download concluido.")

    if not args.no_sync:
        print("Atualizando acervo local e enviando ao GitHub...")
        subprocess.run(["node", "scripts/auto-atualizar-github.js"], cwd=ROOT, check=True)

    return 0


def parse_args():
    parser = argparse.ArgumentParser(
        description="Baixa cifras por artista do BananaCifras para o acervo MDL."
    )
    parser.add_argument(
        "artistas",
        nargs="*",
        help=(
            "Slug ou nome do artista. Exemplos: igreja-biblica-da-paz "
            "ou \"Igreja Biblica da Paz\". Para nome diferente da pasta, use nome=slug."
        ),
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Executa o Chrome em segundo plano.",
    )
    parser.add_argument(
        "--no-sync",
        action="store_true",
        help="Baixa as cifras sem importar nem enviar ao GitHub no final.",
    )
    return parser.parse_args()


def parse_artistas(values):
    artistas = []
    for value in values:
        raw = value.strip()
        if not raw:
            continue
        if "=" in raw:
            nome, slug = [part.strip() for part in raw.split("=", 1)]
        else:
            slug = slugify(raw)
            nome = slug
        if slug:
            artistas.append({"nome": nome or slug, "slug": slug})
    return artistas


def setup_driver(headless=False):
    options = Options()
    options.add_argument("--start-maximized")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-notifications")
    options.add_argument("--lang=pt-BR")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
    if headless:
        options.add_argument("--headless=new")

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver


def processar_artista(driver, artista, index, total):
    slug = artista["slug"]
    letra = slug[0].lower()
    url = f"{BASE_URL}/cifra/{letra}/{slug}"
    pasta = BASE_DIR / artista["nome"]

    print(f"[{index}/{total}] Processando: {artista['nome']}")
    print(f"URL: {url}")

    musicas = obter_lista_musicas(driver, url)
    if not musicas:
        print("Nenhuma musica encontrada. Verifique o slug.")
        return

    print(f"{len(musicas)} musicas encontradas. Iniciando downloads...")
    for song_index, musica in enumerate(musicas, 1):
        print(f"[{song_index}/{len(musicas)}] {musica['titulo']}")
        html = extrair_html_cifra(driver, musica["url"])
        if html:
            salvar_html_artista(
                pasta,
                artista["nome"],
                musica["titulo"],
                html,
                song_index,
                len(musicas),
            )
        else:
            print("Falha ao baixar cifra.")
        time.sleep(DELAY_ENTRE_MUSICAS)


def obter_lista_musicas(driver, url_artista):
    driver.get(url_artista)
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "#artist-tracks a[href*='/cifra/']"))
        )
    except TimeoutException:
        print("Tempo limite ao carregar lista de musicas.")
        return []

    links = driver.find_elements(By.CSS_SELECTOR, "#artist-tracks a[href*='/cifra/']")
    musicas = []
    for link in links:
        href = link.get_attribute("href")
        titulo = link.text.strip()
        if titulo and len(titulo) > 2 and href and "/cifra/" in href:
            slug = href.rstrip("/").split("/")[-1]
            musicas.append({"titulo": titulo, "slug": slug, "url": href})

    vistos = set()
    return [musica for musica in musicas if not (musica["slug"] in vistos or vistos.add(musica["slug"]))]


def extrair_html_cifra(driver, url_musica, tentativas=0):
    try:
        driver.get(url_musica)
        time.sleep(1.5)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "pre#song-pre"))
        )
        pre = driver.find_element(By.CSS_SELECTOR, "pre#song-pre")
        return pre.get_attribute("innerHTML")
    except Exception:
        if tentativas < MAX_TENTATIVAS:
            time.sleep(2)
            return extrair_html_cifra(driver, url_musica, tentativas + 1)
        return None


def salvar_html_artista(pasta_artista, artista_nome, titulo, html_conteudo, indice, total):
    pasta_artista.mkdir(parents=True, exist_ok=True)
    nome_seguro = re.sub(r'[<>:"/\\\\|?*]', "", titulo).strip()
    arquivo = f"{indice:02d} - {nome_seguro}.html"
    caminho = pasta_artista / arquivo

    html_completo = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>{escape_html(titulo)}</title>
<style>
body{{font-family:system-ui,sans-serif;background:#f4f6f9;padding:20px}}
.container{{max-width:800px;margin:auto;background:#fff;padding:30px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1)}}
h1{{color:#333;margin-bottom:5px}}.meta{{color:#666;font-size:0.9em;margin-bottom:20px}}
pre{{background:#fafafa;padding:20px;border-radius:8px;overflow-x:auto;font-family:monospace;font-size:14px;line-height:1.8}}
pre i{{color:#d63384;font-weight:bold;font-style:normal;background:#fdf0f5;padding:2px 5px;border-radius:4px}}
pre u{{text-decoration:none;color:#0d6efd;font-weight:600}}
.creditos{{text-align:center;margin-top:30px;padding-top:20px;border-top:1px solid #e9ecef;color:#6c757d;font-size:0.9em}}
</style></head><body><div class="container">
<h1>{escape_html(titulo)}</h1><div class="meta">Artista: {escape_html(artista_nome)}</div>
<pre>{html_conteudo}</pre>
<div class="creditos">Cifras basicas por Odiman Costa</div>
</div></body></html>"""

    caminho.write_text(html_completo, encoding="utf-8")
    print(f"Salvo [{indice}/{total}]: {arquivo}")


def slugify(value):
    text = value.strip().lower()
    replacements = {
        "á": "a", "à": "a", "ã": "a", "â": "a", "ä": "a",
        "é": "e", "è": "e", "ê": "e", "ë": "e",
        "í": "i", "ì": "i", "î": "i", "ï": "i",
        "ó": "o", "ò": "o", "õ": "o", "ô": "o", "ö": "o",
        "ú": "u", "ù": "u", "û": "u", "ü": "u",
        "ç": "c",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def escape_html(value):
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


if __name__ == "__main__":
    sys.exit(main())
