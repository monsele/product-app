async (page) => {
  const paths = ['upload','review','configuration','objectives','outline','narration','storyboard','preview','render'];
  for (const route of paths) {
    await page.setViewportSize({width:390,height:844});
    await page.goto('http://127.0.0.1:3000/workspace/019ffbf1-610e-738a-b087-6775ff97568c/'+route, {timeout:120000,waitUntil:'domcontentloaded'});
    await page.getByRole('heading').first().waitFor({timeout:60000});
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('p')).some(p => /^Loading (lesson configuration|narration|storyboard|render|source|document|objectives|outline)/i.test(p.textContent ?? '')), {timeout:60000});
    await page.waitForTimeout(1000);
    await page.screenshot({path:'output/playwright/premium-'+route+'-mobile.png'});
    console.log(route, await page.evaluate(() => ({width:innerWidth,content:document.documentElement.scrollWidth})));
  }
}