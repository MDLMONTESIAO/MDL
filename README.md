# Acervo Musical MDL Monte Sião

Sistema separado para leitura de musicas cifradas da MDL Monte Sião.

## Como iniciar

Abra o arquivo:

```bat
iniciar.bat
```

O sistema abre em:

```text
http://localhost:3031
```

## Onde colocar novas cifras

Coloque novas pastas e arquivos dentro de:

```text
acervo\cifras_multi
```

Formato recomendado:

```text
acervo\cifras_multi
|- artista-1
|  |- 01 - Musica.html
|  \- 02 - Outra Musica.html
\- artista-2
   \- 01 - Louvor.html
```

Arquivos aceitos:

```text
.html
.htm
.txt
```

## Atualizacao automatica

Quando o servidor estiver aberto, ele monitora a pasta `acervo\cifras_multi`.
Ao adicionar novas musicas ou novas pastas, o indice e atualizado automaticamente.

Se quiser forcar a atualizacao manualmente, abra:

```bat
atualizar-acervo.bat
```

## Play ensaio

Cada musico pode adicionar musicas ao `Play ensaio` no proprio aparelho.
A lista fica salva no navegador daquele aparelho e permite remover musicas adicionadas por engano.

## Thumbs dos artistas

Entre como `lider`, abra a aba `Artistas` e toque na foto do artista para escolher uma imagem.
No sistema online, a thumb e salva no disco persistente do Render e passa a aparecer para todos os aparelhos.

## Base online do acervo

O importador gera uma base do acervo em:

```text
data\acervo-db.json
```

E salva cada cifra indexada em:

```text
data\songs
```

O servidor usa essa base para entregar o catalogo online pelas APIs:

```text
http://localhost:3031/api/catalog
http://localhost:3031/api/songs/ID_DA_MUSICA
http://localhost:3031/api/offline-bundle
```

## Offline automatico

Quando o musico adiciona uma musica ao `Culto de Domingo`, o app baixa a cifra automaticamente para o armazenamento local do aparelho.

Depois de baixada, a musica fica disponivel offline naquele celular ou navegador, mesmo se a conexao cair durante o culto.

O app tambem instala um service worker para manter a estrutura principal do sistema disponivel offline.

## Publicacao online

O projeto ja esta preparado para subir no Render com disco persistente:

```text
render.yaml
```

Resumo do fluxo:

1. Envie o projeto para um repositorio GitHub.
2. No Render, o caminho mais simples e usar `New > Blueprint` para o Render ler o `render.yaml` da raiz.
3. Se preferir criar manualmente em `New > Web Service`, use:

```text
Name: acervo-musical-mdl-monte-siao
Language: Node
Branch: main
Root Directory: (deixe vazio)
Build Command: npm install
Start Command: npm start
Plan: Starter
```

4. Em `Advanced`, adicione um disco persistente com:

```text
Mount Path: /opt/render/project/src/storage
Size: 5 GB
```

5. Em `Environment Variables`, adicione:

```text
DATA_DIR=/opt/render/project/src/storage
```

6. O Render vai subir o app publico e o servidor passa a usar o disco para gravar o banco do acervo e as cifras indexadas sem sobrescrever os arquivos padrao do repositorio.

Se quiser publicar atualizacoes do acervo sem expor o robo, rode o importador no seu PC e envie os arquivos gerados em `data/` junto com o deploy do sistema.
