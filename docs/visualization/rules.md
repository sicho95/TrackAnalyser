# Règles de visualisation

`VisualizationSpec` sépare la sémantique des écrans. Il choisit la vue temps réel, session et comparaison ainsi que la politique d’unité et d’échelle.

- vitesse et altitude : courbe/profil ;
- cardio, cadence et puissance : courbe, jauge ou distribution ;
- accélérations, roulis, tangage et vario : échelle signée centrée sur zéro ;
- comparaison : échelle commune, valeur absolue, différence, échantillons, couverture et confiance.

Les jauges signées utilisent des bornes physiques. Une petite variation ne redéfinit pas artificiellement toute la plage. La couleur n’est jamais le seul signal. Les valeurs détaillées et la provenance restent dans une vue technique secondaire.
