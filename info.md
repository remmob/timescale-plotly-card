# Timescale Plotly Card

Een custom Lovelace card voor Home Assistant met Plotly ondersteuning.

## Installatie via HACS
1. Voeg deze repository toe als custom repository in HACS (type: Lovelace).
2. Installeer de card via HACS.
3. Voeg het volgende toe aan je resources:
   ```yaml
   url: /hacsfiles/timescale-plotly-card/timescale-plotly-card.js
   type: module
   ```
4. Gebruik de card in je dashboard:
   ```yaml
   type: 'custom:timescale-plotly-card'
   ```
