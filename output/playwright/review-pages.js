async (page) => {
  await page.context().addCookies([{name:'avlp_session',value:'teacher-session',domain:'127.0.0.1',path:'/'}]);
  await page.setViewportSize({width:1440,height:900});
  const paths = ['upload','review','configuration','objectives','outline','narration','storyboard','preview','render'];
  for (const route of paths) {
    await page.goto('http://127.0.0.1:3000/workspace/019ffbf1-610e-738a-b087-6775ff97568c/'+route, {timeout:180000,waitUntil:'domcontentloaded'});
    await page.getByRole('heading').first().waitFor({timeout:60000});
    await page.waitForTimeout(1200);
    await page.screenshot({path:'output/playwright/premium-'+route+'-desktop.png'});
    console.log(route, await page.locator('h1').allTextContents(), await page.evaluate(() => ({width:innerWidth,content:document.documentElement.scrollWidth})));
  }
}