$(function () {
  console.log({ turf });

  // import utilities
  const clone = turf.clone;
  const distance = turf.distance;
  const centroid = turf.centroid;
  const pointsWithinPolygon = turf.pointsWithinPolygon;
  const buffer = turf.buffer;
  const point = turf.helpers.point;
  const radiansToLength = turf.helpers.radiansToLength;
  const degreesToRadians = turf.helpers.degreesToRadians;
  const getCoord = turf.invariant.getCoord;
  const featureEach = turf.meta.featureEach;
  const featureReduce = turf.meta.featureReduce;
  const propReduce = turf.meta.propReduce;

  // console.log(
  //   { clone },
  //   { distance },
  //   { centroid },
  //   { point },
  //   { radiansToLength },
  //   { degreesToRadians },
  //   { getCoord },
  //   { featureEach },
  //   { featureReduce },
  //   { propReduce }
  // );

  // Source/Credit to this repo
  // https://github.com/Turfjs/turf/tree/abelvm/kernelDensity/packages/turf-kernel_density
  function kernelDensity(points, weight) {
    let output = clone(points),
      featureCount = featureReduce(output, (prev) => prev + 1, 0),
      mc,
      dists,
      median,
      sd,
      sr,
      // supposed values as an array
      _getMedian = function (values) {
        // second pain
        // if (!values) return;
        var l = values?.length,
          m = Math.floor(0.5 * l);
        if (values === undefined || l === 0) return null;
        values.sort((a, b) => a - b);
        return l % 2 === 1 ? values[m] : 0.5 * (values[m - 1] + values[m]);
      },
      // as described in https://pro.arcgis.com/en/pro-app/tool-reference/spatial-statistics/standard-distance.htm
      _stdDistance = function (points, weight, centroid, pointsCount) {
        let isWeighted = weight !== undefined && weight.length !== 0,
          m = getCoord(centroid),
          // added latitude correction factor to finetune the 'radiansToLength' function
          latCorrection = Math.cos(degreesToRadians(m[1])),
          _sum = featureReduce(
            output,
            (prev, current) => {
              let w = isWeighted ? current.properties[weight] || 0 : 1,
                c = getCoord(current).map((a, i) => Math.pow(w * a - m[i], 2));
              return prev.map((a, i) => a + c[i]);
            },
            [0, 0]
          ),
          degDist = Math.sqrt((_sum[0] + _sum[1]) / pointsCount);
        return radiansToLength(degreesToRadians(degDist), 'kilometers') / latCorrection;
      };

    // find collection's centroid
    if (weight === undefined || weight.length === 0) {
      mc = centroid(output, {
        weight: null,
      });
    } else {
      let mw = propReduce(output, (prev, current) => prev + current[weight] * 1, 0),
        _weighted = featureReduce(
          output,
          (prev, current) => {
            const w = current.properties[weight],
              c = getCoord(current).map((a) => (a * w) / mw);
            return prev.map((a, i) => a + c[i]);
          },
          [0, 0]
        );
      mc = point(_weighted, {
        weight: mw,
      });
    }

    // calc the median distance from the centroid to each point (km)
    // the original repo will fail here...
    let distArray = [];
    featureEach(output, (current) => {
      distArray.push(distance(current, mc));
    });

    median = _getMedian(distArray);
    // calc the standard distance (pseudo-km)
    sd = _stdDistance(output, weight, mc, featureCount);
    // calc the search radius
    sr = 0.9 * Math.min(sd, Math.sqrt(1 / Math.LN2) * median) * Math.pow(featureCount, -0.2);
    // count the features within the search radius of each feature
    // and assign it as the kernel density
    featureEach(output, (current) => {
      let area = buffer(current, sr),
        ptsWithin = pointsWithinPolygon(output, area);
      // the initial value of -1 is on purpose to disregard the point itself.
      current.properties.kernelDensity = featureReduce(ptsWithin, (prev) => prev + 1, -1);
    });
    return output;
  }

  let map = L.map('map').setView([24.25, 120.5], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Create random points
  let randomPoints = turf.randomPoint(100, {
    bbox: [120.456799, 24.326787, 120.569977, 24.208155],
  });
  turf.featureEach(randomPoints, function (point) {
    point.properties.obs = 1;
  });
  console.log('randomPoints:', randomPoints);

  // zValue can be passed as the second param to the kernelDensity method
  const KDEResult = kernelDensity(randomPoints);
  // console.log('KDEResult:', KDEResult);

  const KDENumberArray = KDEResult.features.map((item) => {
    return item.properties.kernelDensity;
  });
  const KDEMax = Math.max(...KDENumberArray);
  const KDEMin = Math.min(...KDENumberArray);
  const KDERange = KDEMax - KDEMin;
  console.log(KDENumberArray, KDEMax, KDEMin);

  let KDELayer = L.geoJson(null, {
    pointToLayer(point, latlng) {
      const KDEInterval = KDERange / 5;
      const KDEIndex = Math.floor((point.properties.kernelDensity - KDEMin) / KDEInterval);

      let iconOption = {
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      };
      switch (KDEIndex) {
        case 0: {
          iconOption.iconUrl = './img/dot0.png';
          break;
        }
        case 1: {
          iconOption.iconUrl = './img/dot1.png';
          break;
        }
        case 2: {
          iconOption.iconUrl = './img/dot2.png';
          break;
        }
        case 3: {
          iconOption.iconUrl = './img/dot3.png';
          break;
        }
        case 4: {
          iconOption.iconUrl = './img/dot4.png';
          break;
        }
        case 5: {
          iconOption.iconUrl = './img/dot5.png';
          break;
        }
        default: {
          iconOption.iconUrl = './img/dotDefault.png';
          break;
        }
      }
      return L.marker(latlng, {
        icon: L.icon(iconOption),
      }).bindPopup(`prop: ${JSON.stringify(point.properties)}, KDE: ${[point.properties.kernelDensity]}`);
    },
  });
  KDELayer.addData(KDEResult).addTo(map);

  // Assign basic/default kernelDensity value (0) to pointGrids
  // pointGrid is created 0.8 * 0.8 KM
  let pointGrid = turf.pointGrid([120.456799, 24.208155, 120.569977, 24.326787], 0.8, {
    properties: { kernelDensity: 0 },
  });
  // console.log({ pointGrid });

  // Create an array to record the nearest point in pointGrids for KDEResult points
  // Will map the KDEResults to the nearest pointGrids for a raster display
  let findNearestArr = [];
  turf.featureEach(KDEResult, (pt) => {
    let nearestGridPtOfTargetPt = { nearestPt: turf.nearestPoint(pt, pointGrid), selfPt: pt };
    findNearestArr.push(nearestGridPtOfTargetPt);
  });
  console.log(findNearestArr);

  // Accumulate kernel density to pointGrid and create pointGridLayer
  // Must be cloned first and use the new pointGrid for mapping (Still not sure why though...)
  let outputPointGrid = clone(pointGrid);

  for (const el of findNearestArr) {
    const KDENo = el.selfPt.properties.kernelDensity;
    const featureIndex = el.nearestPt.properties.featureIndex;
    // console.log(KDENo, featureIndex);
    outputPointGrid.features[featureIndex].properties.kernelDensity += KDENo;
  }

  console.log('outputPointGrid', outputPointGrid);
  console.log('pointGrid', pointGrid);

  const KDEGridNumberArray = outputPointGrid.features.map((item) => {
    return item.properties.kernelDensity;
  });

  // Being accumulated to grids, so this will not the same as the KDENumberArray numbers.
  const KDEGridMax = Math.max(...KDEGridNumberArray);
  const KDEGridMin = Math.min(...KDEGridNumberArray);
  const KDEGridRange = KDEGridMax - KDEGridMin;
  console.log(KDEGridNumberArray, KDEGridMax, KDEGridMin);

  function isobandGetInterval() {
    return [
      KDEGridMin,
      KDEGridMin + KDEGridRange * 0.1,
      KDEGridMin + KDEGridRange * 0.2,
      KDEGridMin + KDEGridRange * 0.3,
      KDEGridMin + KDEGridRange * 0.4,
      KDEGridMin + KDEGridRange * 0.5,
      KDEGridMin + KDEGridRange * 0.6,
      KDEGridMin + KDEGridRange * 0.7,
      KDEGridMin + KDEGridRange * 0.8,
      KDEGridMin + KDEGridRange * 0.9,
      KDEGridMax,
    ];
  }

  let isobands = turf.isobands(outputPointGrid, isobandGetInterval(), {
    zProperty: 'kernelDensity',
    commonProperties: {
      'fill-opacity': 0.7,
    },
    breaksProperties: [
      { fill: '#FFFF66' },
      { fill: '#FFED47' },
      { fill: '#FFDB29' },
      { fill: '#FFC400' },
      { fill: '#FFA500' },
      { fill: '#FF8C42' },
      { fill: '#FF7043' },
      { fill: '#FF5733' },
      { fill: '#FF4500' },
      { fill: '#FF3300' },
    ],
  });
  // console.log({ isobands });

  let isobandsLayer = L.geoJson(isobands, {
    onEachFeature(feature, layer) {
      layer.bindPopup(feature.properties.kernelDensity);
    },
    style(feature) {
      return {
        fillColor: feature.properties.fill,
        fillOpacity: feature.properties['fill-opacity'],
        // stroke: false,
        color: 'beige',
        weight: 1,
      };
    },
  }).addTo(map);
  map.fitBounds(isobandsLayer.getBounds());
  // console.log('isobandsLayer:', isobandsLayer.getBounds());
});
