# Studio Solare

Applicazione locale-first per stimare la convenienza di un impianto fotovoltaico.

## Cosa fa

- Preventivo, pagamento immediato o finanziamento, detrazione 50% su 10 anni.
- Inserimento manuale delle bollette e import CSV/XLSX.
- Import PDF assistito: estrae consumo e totale quando riconoscibili; date e valori restano modificabili e devono essere verificati.
- Geocodifica della località.
- Produzione fotovoltaica stimata con PVGIS in base a potenza, inclinazione, azimut e perdite.
- Risparmio annuo basato sul costo medio delle bollette, quota di autoconsumo e valore dell'energia immessa.
- Correlazione di Pearson tra consumo giornaliero delle bollette e temperatura, irradiazione e pioggia del medesimo periodo.
- Dati del progetto e delle bollette salvati esclusivamente in `localStorage` del browser.

## Avvio locale

```bash
npm install
npm run dev
```

Apri `http://localhost:3000`.

## Verifiche

```bash
npm test
npm run lint
npm run build
```

## Fonti runtime

- PVGIS per la simulazione di produzione.
- Open-Meteo per geocodifica e archivio meteo giornaliero.

## Limiti del modello

Questa app è una stima orientativa, non una perizia energetica, fiscale o finanziaria. La batteria è raccolta come parametro di progetto, mentre la quota di autoconsumo è impostata esplicitamente perché una simulazione rigorosa richiederebbe dati di consumo orari e una curva di carico. Verifica sempre requisiti fiscali, capienza IRPEF, tariffe, ombreggiamenti e condizioni contrattuali con professionisti qualificati.
