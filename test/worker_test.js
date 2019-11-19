var sinon = require('sinon');
var chai = require('chai');
var expect = chai.expect;
chai.use(require('sinon-chai'));

var Worker = require('../worker.js');
var schema = require('../schema.js')
var _ = require('lodash');

describe("worker", function() {
  var work = null;
  var io = null;
  var context = null;
  var config = null;
  var job = null;
  var exitCode = null;
  var sendStub;

  var prepareWorker = function(done) {
    context = {
      comment: sinon.stub()
    };
    io = {
      on: sinon.stub().yields('123', { exitCode: exitCode, phase: 'test' }),
      removeListener: sinon.stub(),
      emit: sinon.stub()
    };
    Worker.init(config, job, sinon.stub(), function(err, res) {
      expect(context.comment).not.to.have.been.called;
      work = function() {
        res.listen(io, context);
        return sendStub.args[0][0];
      };
      if (done) done();
    })
  };

  afterEach(function(done) {
    sendStub.restore();
    done();
  });

  beforeEach(function(done) {
    sendStub = sinon.stub(require('slackihook').prototype, "send");
    exitCode = 0;
    job = {
      project: { name: "strider-slack" },
      ref: { branch: "master" },
      _id: "123",
      trigger: { 
        type: "manual"
      }
    };
    process.env.strider_server_name = "http://example.com"
    config = {};
    _.each(schema, function(v,k) { config[k] = v.default });
    config.token = 'token';
    config.subdomain = 'subdomain';
    prepareWorker(done);
  });

  it("emits properly", function() {
    var sent =work();
    expect(io.emit).to.have.been.calledWith('job.status.command.comment', '123');
    expect(sent.channel).to.be.equal('#general');
    expect(sent.icon_url).to.be.equal(config.icon_url);
    expect(sent.username).to.be.equal('strider-slack');
    expect(sent.text).to.be.match(/test.*pass/i);
  });

  it("allows changing the channel", function() {
    config.channel = "#builds";
    expect(work().channel).to.eq('#builds');
  });

  describe("test pass text", function() {
    it("uses the right icon", function() {
      var sent = work();
      expect(sent.text).to.include(":white_check_mark:");
      expect(sent.text).not.to.include(":exclamation:");
    });

    it("links happy text to the logs", function() {
      expect(work().text).to.include("<http://example.com/strider-slack/job/123|Tests are passing>");
    });

    it("doesn't say fail", function() {
      expect(work().text).not.to.include("fail");
    });

    describe("manual trigger", function() {
      it("does not try to render a link to an undefined commit", function() {
        expect(work().text).not.to.include("undefined");
      });
    });
  });


  describe("commit trigger", function() {
    var url = "https://github.com/xyz";
    var message = "my commit message";
    beforeEach(function() {
      job.ref.id = 'appears only on commit trigger';
      job.trigger.type = "commit";
      job.trigger.message = message+"\n\n";
      job.trigger.url = url;
      prepareWorker();
    });
    it("links commit message to trigger url", function() {
      expect(work().text).to.include("<"+url+"|"+message+">")
    });
  });

  describe("test fail text", function() {
    beforeEach(function() {
      exitCode = 1;
      prepareWorker();
    });

    it("uses the right icon", function() {
      var sent = work();
      expect(sent.text).to.include(":exclamation:");
      expect(sent.text).not.to.include(":white_check_mark:");
    });

    it("links unhappy text to the logs", function() {
      expect(work().text).to.include("<http://example.com/strider-slack/job/123|Tests are failing>");
    });

    it("doesn't say pass", function() {
      expect(work().text).not.to.include("pass");
    });
  });

  describe("deploy success text", function() {
    beforeEach(function() {
      exitCode = 1;
      prepareWorker();
    });

    it("uses the right icon", function() {
      var sent = work();
      expect(sent.text).to.include(":exclamation:");
      expect(sent.text).not.to.include(":white_check_mark:");
    });

    it("links unhappy text to the logs", function() {
      expect(work().text).to.include("<http://example.com/strider-slack/job/123|Tests are failing>");
    });

    it("doesn't say pass", function() {
      expect(work().text).not.to.include("pass");
    });
  });

  describe("worker listens to events", function() {
    it("listens for cancelled and done event", function() {
      work();
      expect(io.on).to.have.been.calledTwice;
      expect(io.on.getCall(0).args[0]).to.eq('job.status.cancelled');
      expect(io.on.getCall(1).args[0]).to.eq('job.status.phase.done');
    });
  })
});
