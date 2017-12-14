"use strict";

const TokenSale = artifacts.require("./TokenSale.sol");
const SDT = artifacts.require("./SDT.sol");
const TokenVesting = artifacts.require("./TokenVesting.sol");
const assertJump = require("./helpers/assertJump");
const math = require("mathjs");

contract("TokenSale", function(accounts) {
  let bought;
  let error;
  let allocated;
  let collected;

  before(async function () {
    this.currentDate = math.floor(Date.now() / 1000);
    this.sale = await TokenSale.new(
      this.currentDate - 1, 
      this.currentDate + 1000, 
      accounts[5],
      this.currentDate + 100
    );
    this.vesting = await TokenVesting.new();
    this.maxError = 0.00001;
    this.token = null;
  });

  it("should fail if not active", async function() {
    try {
      await this.sale.btcPurchase(10, 0, 0x1, 100, this.currentDate + 5000, 0);
      assert.fail("should have thrown before");
    } catch (error) {
      assertJump(error);
    }
  });

  it("should fail if not owner", async function() {
    try {
      await this.sale.deploy(700 * 10 ** 6, 0, 0x20, { from: accounts[1] });
      assert.fail("should have thrown before");
    } catch (error) {
      assertJump(error);
    }
  });

  it("should be possible to activate crowdsale", async function() {
    await this.sale.deploy(700 * 10 ** 6, 0, this.vesting.address);
    this.token = await SDT.at(await this.sale.token.call());
    assert(this.sale.activated.call());
    assert.equal(await this.token.balanceOf.call(this.sale.address), 700 * 10 ** 24);
  });

  it("should be possible to activate vesting contract", async function() {
    this.vesting.init(this.token.address, this.sale.address);
    assert(await this.vesting.initialized.call());
    assert(await this.vesting.active.call());
    assert.equal(await this.vesting.owner.call(), accounts[0]);
    assert.equal(await this.vesting.ico.call(), this.sale.address);
    assert.equal(await this.vesting.token.call(), await this.sale.token.call());
    assert.equal(await this.token.balanceOf.call(this.vesting.address), 0);
  });

  it("should fail if purchasing less than min", async function() {
    try {
      await this.sale.btcPurchase(9, 0, 0x1, 100, this.currentDate + 5000, 0);
      assert.fail("should have thrown before");
    } catch (error) {
      assertJump(error);
    }
  });

  it("10 USD at 0.14 - should return the right amount with a maximum error of 0.001%", async function() {
    //Calculate tokens
    bought = await this.sale.computeTokens.call(10);
    error = math.abs(bought.valueOf() - 10 / 0.14 * 10 ** 18);

    //execute purchase
    let circulatingSupply = await this.vesting.circulatingSupply.call();
    let saleBalance = await this.token.balanceOf.call(this.sale.address);
    await this.sale.btcPurchase(10, 10, accounts[9], 100, this.currentDate + 5000, 0);
    let newCirculatingSupply = await this.vesting.circulatingSupply.call();
    let newSaleBalance = await this.token.balanceOf.call(this.sale.address);

    let granted = await this.vesting.totalVestedTokens.call({ from: accounts[9] });

    allocated = granted;
    collected = 10;

    assert(error < bought.valueOf() * this.maxError);
    assert.equal(granted.valueOf(), bought.valueOf());
    assert.equal(newSaleBalance, saleBalance - granted);
    assert.equal(newCirculatingSupply.valueOf(), circulatingSupply.valueOf());
    assert.equal(await this.sale.raised.call(), collected);
    assert.equal(await this.sale.soldTokens.call(), granted.valueOf());
  });

  it("6M USD at 0.14 - should return right amount with a maximum error of 0.001%", async function() {
    //Calculate tokens
    bought = await this.sale.computeTokens.call(6000000);
    error = math.abs(bought.valueOf() - 6000000 / 0.14 * 10 ** 18);

    //execute purchase
    let circulatingSupply = await this.vesting.circulatingSupply.call();
    let saleBalance = await this.token.balanceOf.call(this.sale.address);
    await this.sale.btcPurchase(6000000, 0, accounts[9], 100, this.currentDate + 5000, 0);
    let newCirculatingSupply = await this.vesting.circulatingSupply.call();
    let newSaleBalance = await this.token.balanceOf.call(this.sale.address);

    let granted = await this.vesting.totalVestedTokens.call({ from: accounts[9] });

    allocated = allocated.plus(bought);
    collected += 6000000;

    assert(error < bought.valueOf() * this.maxError);
    assert.equal(granted.valueOf(), allocated.valueOf());
    assert.equal(newSaleBalance.valueOf(), saleBalance - bought);
    assert.equal(newCirculatingSupply.valueOf(), circulatingSupply.valueOf());
    assert.equal(await this.sale.raised.call().valueOf(), collected);
    assert.equal(await this.sale.soldTokens.call(), granted.valueOf());

    assert(error < bought.valueOf() * this.maxError);
  });

  it(
    "2M USD with 6M and 10 USD sold," +
      "should return 999990 USD 0.14 and 1000010 with incremental price formula," +
      "with a maximum error of 0.001%",
    async function() {
      let val1 = 999990 / 0.14 * 10 ** 18;
      let val2 = 70000000 * math.log(1.07142928571) * 10 ** 18;

      bought = await this.sale.computeTokens.call(2000000);
      error = math.abs(bought.valueOf() - val1 - val2);

      //execute purchase
      let circulatingSupply = await this.vesting.circulatingSupply.call();
      let saleBalance = await this.token.balanceOf.call(this.sale.address);
      await this.sale.btcPurchase(
        2000000,
        0,
        accounts[9],
        100,
        this.currentDate + 5000,
        0
      );
      let newCirculatingSupply = await this.vesting.circulatingSupply.call();
      let newSaleBalance = await this.token.balanceOf.call(this.sale.address);

      let granted = await this.vesting.totalVestedTokens.call({ from: accounts[9] });

      allocated = allocated.plus(bought);
      collected += 2000000;

      assert(error < bought.valueOf() * this.maxError);
      assert.equal(granted.valueOf(), allocated.valueOf());
      assert.equal(newSaleBalance.valueOf(), saleBalance.sub(bought).valueOf());
      assert.equal(newCirculatingSupply.valueOf(), circulatingSupply.valueOf());
      assert.equal(await this.sale.raised.call().valueOf(), collected);
      assert.equal(await this.sale.soldTokens.call(), granted.valueOf());
    }
  );

  it(
    "7M USD with 8M and 10 USD sold, should return the right amout " +
      "with a maximum error of 0.001%",
    async function() {
      let val1 = 70000000 * math.log(1.46666635556) * 10 ** 18;

      bought = await this.sale.computeTokens.call(7000000);
      error = math.abs(bought.valueOf() - val1);

      //execute purchase
      let circulatingSupply = await this.vesting.circulatingSupply.call();
      let saleBalance = await this.token.balanceOf.call(this.sale.address);
      await this.sale.btcPurchase(
        7000000,
        0,
        accounts[9],
        100,
        this.currentDate + 5000,
        0
      );
      let newCirculatingSupply = await this.vesting.circulatingSupply.call();
      let newSaleBalance = await this.token.balanceOf.call(this.sale.address);

      let granted = await this.vesting.totalVestedTokens.call({ from: accounts[9] });

      allocated = allocated.plus(bought);
      collected += 7000000;

      assert(error < bought.valueOf() * this.maxError);
      assert.equal(granted.valueOf(), allocated.valueOf());
      assert.equal(newSaleBalance.valueOf(), saleBalance.sub(bought).valueOf());
      assert.equal(newCirculatingSupply.valueOf(), circulatingSupply.valueOf());
      assert.equal(await this.sale.raised.call().valueOf(), collected);
      assert.equal(await this.sale.soldTokens.call(), granted.valueOf());
    }
  );

  it( "Should be possible to stop the sale", async function() {
    this.sale.stop();
    try {
      await this.sale.btcPurchase(
        7000000,
        0,
        accounts[9],
        100,
        this.currentDate + 5000,
        0
      );
      assert.fail("should have thrown before");
    } catch (error) {
      assertJump(error);
    }
  });

  it( "Should be possible to resume the sale", async function() {
    this.sale.resume();
    await this.sale.btcPurchase(
      7000000,
      0,
      accounts[9],
      100,
      this.currentDate + 5000,
      0
    );
  });

});
