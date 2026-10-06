async (page) => {
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'output/playwright/premium-render-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/premium-render-mobile.png'});
  console.log(await page.evaluate(() => ({width:innerWidth,content:document.documentElement.scrollWidth})));
}