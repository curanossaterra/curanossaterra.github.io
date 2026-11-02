"""Salva as 3 últimas lives do canal no lives.json (usado pela página principal).

Roda sozinho pelo GitHub Actions (.github/workflows/lives.yml). Não precisa de chave:
lê a lista pública "Live streams" do canal (playlist UULV + id do canal sem o "UC").
"""
import json
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

CANAL_ID = "UCWSUUew7b_bpvWydV2IsA1A"  # youtube.com/@CuraNossaTerra
QUANTIDADE = 3
FEED = f"https://www.youtube.com/feeds/videos.xml?playlist_id=UULV{CANAL_ID[2:]}"
SAIDA = pathlib.Path(__file__).resolve().parent.parent / "lives.json"

NS = {
    "a": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
}


def main():
    req = urllib.request.Request(FEED, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raiz = ET.fromstring(resp.read())

    lives = []
    for entrada in raiz.findall("a:entry", NS)[:QUANTIDADE]:
        lives.append({
            "id": entrada.findtext("yt:videoId", namespaces=NS),
            "titulo": entrada.findtext("a:title", namespaces=NS),
            "publicado": entrada.findtext("a:published", namespaces=NS),
        })

    # feed vazio ou fora do ar: mantém o arquivo antigo em vez de apagar os vídeos do site
    if not lives:
        raise SystemExit("Nenhuma live encontrada no feed; lives.json não foi alterado.")

    SAIDA.write_text(json.dumps(lives, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(lives)} lives salvas em {SAIDA.name}")


if __name__ == "__main__":
    main()
