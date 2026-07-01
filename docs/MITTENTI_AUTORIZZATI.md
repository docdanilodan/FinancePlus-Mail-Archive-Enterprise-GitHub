# Mittenti autorizzati allo scarico

Questa versione scarica esclusivamente le mail provenienti dai seguenti indirizzi:

| # | Mittente autorizzato |
|---:|---|
| 1 | elibetty731@gmail.com |
| 2 | Valentinaboratto82@gmail.com |
| 3 | stefano.faraone@eurofintechsrl.it |
| 4 | praticheBS@proton.me |
| 5 | sergio.pedolazzi@katudi.it |
| 6 | paolo.baldinelli@katudi.it |
| 7 | pratiche@katudi.it |
| 8 | niccolo.sovico@ener2crowd.com |

## Regola applicata

L'app costruisce una ricerca Gmail con filtro `from:` sui soli mittenti autorizzati.

Esempio logico:

```text
from:elibetty731@gmail.com OR from:Valentinaboratto82@gmail.com OR ...
```

Quindi non vengono scaricate mail ricevute da altri indirizzi.

## Dove si modifica in futuro

Nel file `app.py`, la lista si trova nella costante:

```python
PRIORITY_SENDERS = [
    "elibetty731@gmail.com",
    "Valentinaboratto82@gmail.com",
    "stefano.faraone@eurofintechsrl.it",
    "praticheBS@proton.me",
    "sergio.pedolazzi@katudi.it",
    "paolo.baldinelli@katudi.it",
    "pratiche@katudi.it",
    "niccolo.sovico@ener2crowd.com",
]
```
