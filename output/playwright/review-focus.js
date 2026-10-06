async (page) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:3000/workspace/019ffbf1-610e-738a-b087-6775ff97568c/storyboard', {timeout:180000});
  await page.getByRole('heading', {name:'Storyboard', exact:true}).waitFor({timeout:60000});
  await page.screenshot({path:'output/playwright/premium-storyboard-desktop.png'});
  console.log(await page.locator('h1').allTextContents());
}