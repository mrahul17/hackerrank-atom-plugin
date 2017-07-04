'use babel';

import HackerrankView from './hackerrank-view';
import { CompositeDisposable } from 'atom';
import re from 'request';
require('request').debug = true;
let cookie = require('cookie')

export default {

  hackerrankView: null,
  modalPanel: null,
  subscriptions: null,


  activate(state) {
    this.hackerrankView = new HackerrankView(state.hackerrankViewState);
    this.modalPanel = atom.workspace.addModalPanel({
      item: this.hackerrankView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'hackerrank:toggle': () => this.toggle()
    }));
  },

  deactivate() {
    this.modalPanel.destroy();
    this.subscriptions.dispose();
    this.hackerrankView.destroy();
  },

  serialize() {
    return {
      hackerrankViewState: this.hackerrankView.serialize()
    };
  },

  checkRequirements(){
    if(process.env.hr_username==undefined || process.env.hr_password==undefined){
      return false;
    }
    else {
      return true;
    }
  },

  toggle() {
    if(!this.checkRequirements()){
      console.log('Please input credentials(hr_username and hr_password) in environment or hardcode in this file(auth).')
      return;
    }
    let editor
    let loginUrl = 'https://www.hackerrank.com/auth/login'
    let masterUrl = 'https://www.hackerrank.com/rest/contests/master/challenges/'
    let challengeBaseUrl = 'https://www.hackerrank.com/challenges/'
    let lang = {
      'py':'python',
      'java':'java',
      'c':'c',
      'cpp':'cpp'
    }
    let submissionID;
    if (editor = atom.workspace.getActiveTextEditor()) {
      let code = editor.getText()
      let fileName = editor.getTitle()
      let problemName = fileName.split(".")[0]
      let solutionExtension = fileName.split(".")[1]
      let problemUrl = challengeBaseUrl+problemName+'/problem'
      let submissionUrl = masterUrl + problemName + '/submissions';
      let compileTestUrl = masterUrl + problemName + '/compile_tests'
      let requestJson = {
        'code': code,
        'language': lang[solutionExtension],
        'customtestcase': false,
      }
      let submitJson = {
        'code' : code,
        'contest_slug' : 'master',
        'language' : 'cpp'
      }
      let auth = {
        'login': process.env.hr_username,
        'password': process.env.hr_password,
        'remember_me': 'false',
        'fallback': 'true'
      }
      let customHeader = {
        'connection': 'keep-alive',
        'User-Agent' : 'Atom-hackerrank-plugin'
      }
      let regexp = /meta name="csrf-token" content="(.*)"/
      let j = re.jar();
      let request = re.defaults({jar: j, headers:customHeader})


      request({url: 'https://www.hackerrank.com/login', method: "GET"}, (e,r,b)=>{
        console.log(this)
        let csrf = b.match(regexp)[1];
        customHeader['content-type']
        let diffHeaders = {
          'x-csrf-token': csrf,
          'content-type':'application/x-www-form-urlencoded',
        }
        request({url: loginUrl, method: "POST", formData: auth, headers: diffHeaders}, (e,r,b)=>{
          request({url: problemUrl, method: "GET"}, (e,r,b)=>{
             csrf = b.match(regexp)[1];
             let diffHeaders = {
               'x-csrf-token': csrf,
               'content-type':'application/json',
             }

             request({url: submissionUrl, method: "POST", json: submitJson, headers: diffHeaders}, (err, res, body) => {

            if (!err && res.statusCode == 200){
              // let submissionID = body['model']['id']
              // console.log(submissionID)
              //
              // let infoUrl = url + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString()
              // request({url: infoUrl, method: "GET", headers: res.headers}, (error, response, bod) => {
              //   console.log(response)
              //   console.log(bod)
              // })


            }

        })
      })
    })
    })

      // let url = masterUrl + problemName + '/compile_tests'
      //
      // request("https://www.hackerrank.com", (e, r, b) => {
      //   let yo = r['headers']['set-cookie']
      //   console.log(yo)
      //   request({url: url, method: "POST", json: requestJson}, (err, res, body) => {
      //     if (!err && res.statusCode == 200){
      //       let submissionID = body['model']['id']
      //       let infoUrl = url + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString()
      //       let ck = cookie.parse(yo[0])
      //       let ck2 = cookie.parse(yo[2])
      //       let cookies = "hackerrank_mixpanel_token=" + ck['hackerrank_mixpanel_token'] +";"+ "_hrank_session=" + ck2['_hrank_session'] + ";"
      //       let cook = re.cookie(cookies)
      //       let j = re.jar()
      //       j.setCookie(cook, infoUrl)
      //       console.log(cookies)
      //       console.log(infoUrl)
      //       request({url: infoUrl, method: "GET", jar: j}, (error, response, bod) => {
      //         console.log(response)
      //         console.log(bod)
      //       })
      //     }
      //   })
      // })


      // request({
      //   url: url,
      //   json: requestJson,
      //   method: "POST"
      // }, (err, res, body) => {
      //   if (!err && res.statusCode == 200) {
      //     let header = res.headers
      //     console.log(res)
      //     console.log(header)
      //     console.log(header.cookie)
      //     console.log(body)

      //     // let cookies = "hackerrank_mixpanel_token=" + ck['hackerrank_mixpanel_token'].value +";"+ "_hackerrank_session=" + ck['_hackerrank_session'].value + ";"
      //     // console.log(cookies)
      //     submissionID = body['model']['id']
      //     console.log(submissionID)
      //     let infoUrl = url + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString()
      //     request({
      //       url: infoUrl,
      //       method: "POST"
      //     }, (error, response, solutionBody) => {
      //       console.log(solutionBody)
      //     })
      //
      //
      //   }
      // })

    }
  }
};
