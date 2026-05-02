import { test, expect } from '@playwright/test';

const FLIGHT_ID       = 7417;
const COMPARED_ID     = 100;
const PARAM_A         = 'ALTITUDE';
const PARAM_B         = 'AIRSPEED';
const PARAM_C         = 'HEADING';
const ANOMALY_TIME    = 1005; // epoch second used as representative anomaly

// ── Shared mock data ──────────────────────────────────────────────────────────

function makeTelemetryRows(masterIndex: number, count: number, baseTime: number) {
  return Array.from({ length: count }, (_, i) => ({
    masterIndex,
    timestep: baseTime + i,
    fields: {
      [PARAM_A]: 1000 + Math.sin(i * 0.5) * 50,
      [PARAM_B]: 200  + Math.cos(i * 0.3) * 20,
      [PARAM_C]: 180  + Math.sin(i * 0.2) * 30,
    },
  }));
}

const flightMeta = {
  // AnomaliesService reads: flightMeta.anomalies[param] → AnomalyWindow[]
  anomalies: {
    [PARAM_A]: [{ startEpoch: 1004, endEpoch: 1006, representativeEpoch: ANOMALY_TIME, label: 'spike' }],
  },
  // HistoricalSimilarityService reads: flightMeta.historicalSimilarity[param]
  historicalSimilarity: {
    [PARAM_A]: [{
      recordId: 'hist-1',
      comparedFlightIndex: COMPARED_ID,
      startEpoch: 1003,
      endEpoch: 1007,
      label: 'similar_pattern',
      finalScore: 0.91,
      anomalyTime: ANOMALY_TIME,
    }],
  },
};

// Used by parameterSpecialPointsCountMap (badge counts in the left panel)
const specialPoints = {
  anomalies: {
    [PARAM_A]: [ANOMALY_TIME], // 1 anomaly
    [PARAM_B]: [],
    [PARAM_C]: [],
  },
  historicalSimilarity: {
    [PARAM_A]: [{ anomalyTime: ANOMALY_TIME }], // 1 unique historical
    [PARAM_B]: [],
    [PARAM_C]: [],
  },
};

// ── beforeEach: register all HTTP mocks + navigate ───────────────────────────

test.describe('Analyze Page — Core Interactions', () => {
  test.beforeEach(async ({ page }) => {
    // Flight telemetry rows  →  GET /TelemetryDataArchive/fields/{id}
    await page.route(`**/TelemetryDataArchive/fields/${FLIGHT_ID}`, async (route) => {
      await route.fulfill({ json: makeTelemetryRows(FLIGHT_ID, 20, 1000) });
    });

    // Flight metadata (anomalies + historical similarity windows)  →  GET /flight/{id}
    await page.route(`**/TelemetryDataArchive/flight/${FLIGHT_ID}`, async (route) => {
      await route.fulfill({ json: flightMeta });
    });

    // Special-points counts (drives badge numbers in the left panel)
    await page.route(`**/get-all-special-points-for-flight/${FLIGHT_ID}`, async (route) => {
      await route.fulfill({ json: specialPoints });
    });

    // Related parameters for PARAM_A (getFlightConnectionsParam)
    await page.route('**/get-flight-connections/**', async (route) => {
      const url = route.request().url();
      if (url.includes(`/${PARAM_A}`)) {
        await route.fulfill({ json: [PARAM_B, PARAM_C] });
      } else {
        await route.fulfill({ json: [] });
      }
    });

    // Compared-flight telemetry (loaded lazily for historical mini-charts)
    await page.route(`**/TelemetryDataArchive/fields/${COMPARED_ID}`, async (route) => {
      await route.fulfill({ json: makeTelemetryRows(COMPARED_ID, 15, 2000) });
    });

    // Compared-flight metadata + special-points (needed if test navigates there)
    await page.route(`**/TelemetryDataArchive/flight/${COMPARED_ID}`, async (route) => {
      await route.fulfill({ json: { anomalies: {}, historicalSimilarity: {} } });
    });
    await page.route(`**/get-all-special-points-for-flight/${COMPARED_ID}`, async (route) => {
      await route.fulfill({ json: null });
    });

    // Navigate directly to the analyze page for this flight
    await page.goto(`http://localhost:4200/archive/${FLIGHT_ID}`);

    // Wait until the parameter cards are rendered (flight data loaded)
    await page.waitForSelector('.paramCard', { timeout: 10_000 });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Parameter list
  // ────────────────────────────────────────────────────────────────────────────

  test('all parameters render with anomaly and historical badges', async ({ page }) => {
    // All 3 parameters are rendered in the DOM
    await expect(page.locator('.paramCard')).toHaveCount(3);

    // ALTITUDE has 1 anomaly and 1 historical match
    const altCard = page.locator('.paramCard').filter({ hasText: PARAM_A });
    await expect(altCard.locator('.anomalyBadge')).toContainText('Anomalies (1)', { timeout: 5_000 });
    await expect(altCard.locator('.historyBadge')).toContainText('Historical (1)', { timeout: 5_000 });

    // AIRSPEED has zero counts
    const bCard = page.locator('.paramCard').filter({ hasText: PARAM_B });
    await expect(bCard.locator('.anomalyBadge')).toContainText('Anomalies (0)', { timeout: 5_000 });
    await expect(bCard.locator('.historyBadge')).toContainText('Historical (0)', { timeout: 5_000 });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Select parameter → Highcharts chart loads
  // ────────────────────────────────────────────────────────────────────────────

  test('clicking a parameter card opens a Highcharts chart in the grid', async ({ page }) => {
    // Grid section is hidden when nothing is selected
    await expect(page.locator('.gridSection')).not.toBeVisible();
    await expect(page.locator('.emptyState')).toBeVisible();

    // Select ALTITUDE
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    // Grid section appears with one chart card
    await expect(page.locator('.gridSection')).toBeVisible();
    await expect(page.locator('.gridChartCard')).toHaveCount(1);
    await expect(page.locator('.gridChartTitle')).toHaveText(PARAM_A);

    // Highcharts SVG root is rendered inside the chart body
    await expect(
      page.locator('.gridChartBody .highcharts-root'),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Two parameters → two charts
  // ────────────────────────────────────────────────────────────────────────────

  test('selecting two parameters shows two independent Highcharts charts', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await page.locator('.paramCard').filter({ hasText: PARAM_B }).click();

    await expect(page.locator('.gridChartCard')).toHaveCount(2, { timeout: 10_000 });

    await expect(page.locator('.gridChartTitle').filter({ hasText: PARAM_A })).toBeVisible();
    await expect(page.locator('.gridChartTitle').filter({ hasText: PARAM_B })).toBeVisible();

    // Both charts render their Highcharts SVG
    await expect(page.locator('.gridChartBody .highcharts-root')).toHaveCount(2, { timeout: 10_000 });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Remove chart via X button
  // ────────────────────────────────────────────────────────────────────────────

  test('clicking the X on a chart card removes it and shows the empty state', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.gridChartCard')).toHaveCount(1, { timeout: 10_000 });

    await page.locator('.gridChartClose').click();

    await expect(page.locator('.gridChartCard')).toHaveCount(0);
    await expect(page.locator('.emptyState')).toBeVisible();

    // Parameter card returns to unselected state
    await expect(
      page.locator('.paramCard').filter({ hasText: PARAM_A }),
    ).not.toHaveClass(/selected/);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Toggle anomaly series visibility
  // ────────────────────────────────────────────────────────────────────────────

  test('Anomalies button toggles the red anomaly series on and off', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    const anomalyBtn = page.locator('.anomalyBtn');
    await expect(anomalyBtn).toBeVisible({ timeout: 10_000 });

    // Initially visible (no .hidden class)
    await expect(anomalyBtn).not.toHaveClass(/hidden/);

    // Click → series hidden → button gets .hidden class
    await anomalyBtn.click();
    await expect(anomalyBtn).toHaveClass(/hidden/);

    // Click again → series restored → .hidden class removed
    await anomalyBtn.click();
    await expect(anomalyBtn).not.toHaveClass(/hidden/);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Toggle historical series visibility
  // ────────────────────────────────────────────────────────────────────────────

  test('Historical button toggles the yellow historical series on and off', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    const histBtn = page.locator('.historyBtn');
    await expect(histBtn).toBeVisible({ timeout: 10_000 });
    await expect(histBtn).not.toHaveClass(/hidden/);

    await histBtn.click();
    await expect(histBtn).toHaveClass(/hidden/);

    await histBtn.click();
    await expect(histBtn).not.toHaveClass(/hidden/);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. Sidebar — Related tab
  // ────────────────────────────────────────────────────────────────────────────

  test('Related sidebar shows connected parameters fetched from the API', async ({ page }) => {
    // Select ALTITUDE → triggers getFlightConnectionsParam(7417, ALTITUDE)
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    // Sidebar is on Related mode by default
    await expect(
      page.locator('.modeBtn').filter({ hasText: 'Related' }),
    ).toHaveClass(/active/);

    // Both related parameters appear in the sidebar
    await expect(
      page.locator('.sidebarItem').filter({ hasText: PARAM_B }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('.sidebarItem').filter({ hasText: PARAM_C }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 8. Click related param → adds it to the grid
  // ────────────────────────────────────────────────────────────────────────────

  test('clicking a related parameter in the sidebar opens it as a second chart', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    // Wait for related params to load
    const relatedItem = page.locator('.sidebarItem').filter({ hasText: PARAM_B });
    await expect(relatedItem).toBeVisible({ timeout: 10_000 });

    // Click AIRSPEED in the sidebar
    await relatedItem.click();

    // Two charts now in the grid
    await expect(page.locator('.gridChartCard')).toHaveCount(2, { timeout: 10_000 });
    await expect(
      page.locator('.gridChartTitle').filter({ hasText: PARAM_B }),
    ).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 9. Sidebar — switch to Historical, time groups appear
  // ────────────────────────────────────────────────────────────────────────────

  test('switching to Historical sidebar shows grouped historical matches', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    // Wait for the Highcharts chart to fully initialise
    // (initGridChart calls loadAndShowHistoricalSimilarity, populating sidebarItems)
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });

    // Switch to Historical tab
    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(
      page.locator('.modeBtn').filter({ hasText: 'Historical' }),
    ).toHaveClass(/active/);

    // One time-group should appear (one unique anomalyTime = 1005)
    await expect(page.locator('.timeGroup')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.countBadge')).toContainText('1 match');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 10. Expand time group → cards visible with correct data
  // ────────────────────────────────────────────────────────────────────────────

  test('expanding a historical time group reveals the match card with score and flight info', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });

    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.timeGroup')).toBeVisible({ timeout: 10_000 });

    // Cards are hidden until group is expanded
    await expect(page.locator('.historicalCardNew')).toHaveCount(0);

    // Expand the group
    await page.locator('.timeGroupHeader').click();

    // One card appears
    await expect(page.locator('.historicalCardNew')).toHaveCount(1, { timeout: 5_000 });

    // Card shows the compared flight number and 91% similarity score
    await expect(page.locator('.hcardFlight')).toContainText(`Flight #${COMPARED_ID}`);
    await expect(page.locator('.hcardScore')).toContainText('91%');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 11. Hover on sidebar card → card gets .hovered class
  // ────────────────────────────────────────────────────────────────────────────

  test('hovering on a historical sidebar card highlights it', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });

    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.timeGroup')).toBeVisible({ timeout: 10_000 });
    await page.locator('.timeGroupHeader').click();

    const card = page.locator('.historicalCardNew');
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Hover → (mouseenter) → onHistoricalCardHover → sets hoveredHistoricalId
    await card.hover();

    // Angular binding [class.hovered]="hoveredHistoricalId === ..." resolves to true
    await expect(card).toHaveClass(/hovered/);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 12. Hover on yellow chart point → matching sidebar card highlights
  //
  //     The Highcharts chart dispatches window event "historical-point-hover"
  //     when the user mouses over a yellow scatter point.
  //     We simulate that event to test the full:
  //       chart event → onHistoricalHover() → card.classList.add('hovered')
  // ────────────────────────────────────────────────────────────────────────────

  test('dispatching historical-point-hover highlights the matching sidebar card', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });

    // Open Historical sidebar and expand the group so the card is in the DOM
    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.timeGroup')).toBeVisible({ timeout: 10_000 });
    await page.locator('.timeGroupHeader').click();
    await expect(page.locator('.historicalCardNew')).toBeVisible({ timeout: 5_000 });

    // Simulate the chart firing "historical-point-hover" for anomalyTime = 1005.
    // onHistoricalHover() finds cards where data-id.split('_').slice(1) === '1005'
    // and calls classList.add('hovered') on them.
    await page.evaluate((anomalyTime) => {
      window.dispatchEvent(
        new CustomEvent('historical-point-hover', {
          detail: { anomalyTime: String(anomalyTime) },
        }),
      );
    }, ANOMALY_TIME);

    await expect(
      page.locator('.historicalCardNew.hovered'),
      'card matching the hovered chart point should get .hovered class',
    ).toBeVisible({ timeout: 5_000 });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 13. Historical card click → navigates to the compared flight
  // ────────────────────────────────────────────────────────────────────────────

  test('clicking a historical card navigates to the compared flight analyze page', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });

    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.timeGroup')).toBeVisible({ timeout: 10_000 });
    await page.locator('.timeGroupHeader').click();

    await expect(page.locator('.historicalCardNew')).toBeVisible({ timeout: 5_000 });

    // navigateToHistoricalFlight() → router.navigate(['/archive', comparedFlightIndex], { queryParams: { param } })
    await page.locator('.historicalCardNew').click();

    await expect(page).toHaveURL(new RegExp(`/archive/${COMPARED_ID}`), { timeout: 5_000 });
    await expect(page).toHaveURL(new RegExp(`param=${PARAM_A}`));
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 14. Parameter search filters the visible cards
  // ────────────────────────────────────────────────────────────────────────────

  test('searching hides non-matching parameter cards via hidden1 class', async ({ page }) => {
    // Type ALTITUDE in the search box
    await page.locator('input.searchInput').fill(PARAM_A);

    // Only ALTITUDE is visible; the others have display:none via .hidden1
    await expect(page.locator('.paramCard:not(.hidden1)')).toHaveCount(1, { timeout: 5_000 });
    await expect(
      page.locator('.paramCard:not(.hidden1)').filter({ hasText: PARAM_A }),
    ).toBeVisible();

    // Clear search → all three cards visible again
    await page.locator('button.clearBtn').click();
    await expect(page.locator('.paramCard:not(.hidden1)')).toHaveCount(3);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 15. Sort by Historical → ALTITUDE (has matches) appears first
  // ────────────────────────────────────────────────────────────────────────────

  test('sorting by Historical puts parameters with historical matches first', async ({ page }) => {
    // Wait for badge data to load
    await expect(
      page.locator('.paramCard').filter({ hasText: PARAM_A }).locator('.historyBadge'),
    ).toContainText('Historical (1)', { timeout: 5_000 });

    // Click Historical sort button
    await page.locator('.sortPill button').filter({ hasText: 'Historical' }).click();

    // The first visible card should be ALTITUDE (1 historical match > 0)
    const firstCard = page.locator('.paramCard:not(.hidden1)').first();
    await expect(firstCard).toContainText(PARAM_A);
  });
});
