'use babel';

import HackerrankView from './hackerrank-view';
import { CompositeDisposable } from 'atom';
import re from 'request';
//require('request').debug = true;
let cookie = require('cookie')

let loggedInStatus = false;
let customHeader = {
  'connection': 'keep-alive',
  'User-Agent' : 'Atom-hackerrank-plugin'
}
let regexp = /meta name="csrf-token" content="(.*)"/
let j = re.jar();
let request = re.defaults({jar: j, headers:customHeader})


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
      'hackerrank:compile': () => this.compile(),
      'hackerrank:submit': () => this.submit(),
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

  login() {
    return new Promise((resolve, reject)=> {
      if(loggedInStatus){
        resolve(true);
        return;
      }
      if(!this.checkRequirements()){
        console.log('Please input credentials(hr_username and hr_password) in environment or hardcode in this file(auth).')
        resolve(false);
        return;
      }
      let loginUrl = 'https://www.hackerrank.com/auth/login';
      let auth = {
        'login': process.env.hr_username,
        'password': process.env.hr_password,
        'remember_me': 'false',
        'fallback': 'true'
      }
      request({url: 'https://www.hackerrank.com/login', method: "GET"}, (e,r,b)=>{
        let csrf = b.match(regexp)[1];
        let diffHeaders = {
          'x-csrf-token': csrf,
          'content-type':'application/x-www-form-urlencoded',
        }
        request({url: loginUrl, method: "POST", formData: auth, headers: diffHeaders}, (e,r,b)=>{
          if(r.statusCode==200){
            loggedInStatus = true;
          }
          resolve(loggedInStatus);
        });
      });
    });
  },
  submit() {
    this.login().then(function(status){
      if(!status){
        console.log("Login was unsuccessful!");
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
        request({url: problemUrl, method: "GET"}, (e,r,b)=>{
           csrf = b.match(regexp)[1];
           let diffHeaders = {
             'x-csrf-token': csrf,
             'content-type':'application/json',
           }

           request({url: submissionUrl, method: "POST", json: submitJson, headers: diffHeaders}, (err, res, body) => {
             let submissionID = body['model']['id'];
             let infoUrl = submissionUrl + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString()
             let repId = setInterval(()=>{
               request({url: infoUrl, method: "GET", headers: diffHeaders}, (e,r,b) => {
                 let resp = JSON.parse(b);
                 let msg = resp['model']['status'];
                 if(['Wrong','Compilation','Accepted','Codechecker'].includes(msg.split(" ")[0])){
                   clearInterval(repId);
                   console.log(msg);
                 }
                 infoUrl = compileTestUrl + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString();
               })

             },2000);
           });
         });
    }
  });
},
  compile(){

    this.login().then(function(status){
        if(!status){
          console.log("Login was unsuccessful!")
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
            'language' : lang[solutionExtension]
          }
          request({url: problemUrl, method: "GET"}, (e,r,b)=>{
             csrf = b.match(regexp)[1];
             let diffHeaders = {
               'x-csrf-token': csrf,
               'content-type':'application/json',
             }

             request({url: compileTestUrl, method: "POST", json: requestJson, headers: diffHeaders}, (err, res, body) => {
               let submissionID = body['model']['id'];
               let infoUrl = compileTestUrl + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString()
               let repId = setInterval(()=>{
                 request({url: infoUrl, method: "GET", headers: diffHeaders}, (e,r,b) => {
                   let resp = JSON.parse(b);
                   if(resp['model']['status'] != 0){
                     clearInterval(repId);
                     let msg = resp['model']['compilemessage'];
                     if(msg==""){
                       console.log("Compile successful");
                     }else{
                       console.log(msg);
                     }
                   }
                   infoUrl = compileTestUrl + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString();
                 })
               },2000);
             });
           });
          }
        });
      }
    }
