# EMB viewer

Browser-based Wilcom `.emb` reader. Drop a file to see its preview, thread colours and stitch counts. Everything runs client-side: files are never uploaded.

## Use

Open `index.html` in a browser (or the GitHub Pages site) and drop one or more `.emb` files on the page.

## What it reads

- Preview images (artwork, TrueView, design icon)
- Thread colour table: name, RGB, stitches per colour, total stitches
- Machine type and summary metadata (title, author) when present

## Limits

- Stitch coordinates are not decoded. They live in a proprietary `DesignDocument` stream.
- Older `.emb` files use a different layout: only the 100×100 design icon is shown, with no colour table.

## How it works

An `.emb` file is an OLE2 compound document. `ole.js` parses the container, and `emb.js` inflates the zlib streams and extracts the previews and colour table. No dependencies, no build step.
