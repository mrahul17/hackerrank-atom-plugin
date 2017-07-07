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
const URLs = {
  'loginUrl': 'https://www.hackerrank.com/auth/login',
  'masterUrl': 'https://www.hackerrank.com/rest/contests/master/challenges/',
  'challengeBaseUrl': 'https://www.hackerrank.com/challenges/'
}
const LANG = {
  'py':'python',
  'java':'java',
  'c':'c',
  'cpp':'cpp'
}


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
  showError(e){
    atom.notifications.addFatalError("Error Occurred, Try again", {'detail': e})
  },

  login() {
    return new Promise((resolve, reject)=> {
      if(loggedInStatus){
        resolve(true);
        return;
      }
      if(!this.checkRequirements()){
        atom.notifications.addError('Login credentials not found', {'detail':
        'Please input credentials(hr_username and hr_password) in environment or hardcode in this file(auth).'})
        resolve(false);
        return;
      }
      let auth = {
        'login': process.env.hr_username,
        'password': process.env.hr_password,
        'remember_me': 'false',
        'fallback': 'true'
      }
      atom.notifications.addInfo("Connecting..")
      request({url: 'https://www.hackerrank.com/login', method: "GET"}, (e,r,b)=>{
        if(e){
          this.showError(e)
          return
        }

        let csrf = b.match(regexp)[1];
        let diffHeaders = {
          'x-csrf-token': csrf,
          'content-type':'application/x-www-form-urlencoded',
        }
        atom.notifications.addInfo("Logging you in ..")

        request({url: URLs.loginUrl, method: "POST", formData: auth, headers: diffHeaders}, (e,r,b)=>{

          if(r.statusCode==200){
            atom.notifications.addSuccess("Login Successful")
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
        atom.notifications.addError("Login was unsuccessful!");
        return;
      }

      let editor
      let submissionID;
      if (editor = atom.workspace.getActiveTextEditor()) {
        let code = editor.getText()
        let fileName = editor.getTitle()
        let problemName = fileName.split(".")[0]
        let solutionExtension = fileName.split(".")[1]
        let problemUrl = URLs.challengeBaseUrl+problemName+'/problem'
        let submissionUrl = URLs.masterUrl + problemName + '/submissions';
        let submitJson = {
          'code' : code,
          'contest_slug' : 'master',
          'language' : LANG[solutionExtension]
        }
        request({url: problemUrl, method: "GET"}, (e,r,b)=>{

           csrf = b.match(regexp)[1];
           let diffHeaders = {
             'x-csrf-token': csrf,
             'content-type':'application/json',
           }
           atom.notifications.addInfo('Submitting..');
           request({url: submissionUrl, method: "POST", json: submitJson, headers: diffHeaders}, (e,r,b) => {
             if(e){
               this.showError(e)
               return
             }
             let submissionID = b['model']['id'];
             let infoUrl = submissionUrl + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString()
             let repId = setInterval(()=>{
               request({url: infoUrl, method: "GET", headers: diffHeaders}, (e,r,b) => {
                 if(e){
                   this.showError(e)
                   clearInterval(repId)
                   return
                 }
                 let resp = JSON.parse(b);
                 let msg = resp['model']['status'];
                 if(msg=='Accepted'){
                   clearInterval(repId)
                   atom.notifications.addSuccess("Submission Successful",{'detail': msg});
                 }
                 else if(['Wrong','Compilation','Codechecker'].includes(msg.split(" ")[0])){
                   clearInterval(repId);
                   atom.notifications.addError("Submission Unsuccessful",{'detail': msg});
                 }
                 infoUrl = submissionUrl + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString();
               })

             },3000);
           });
         });
    }
  });
},
  compile(){

    this.login().then(function(status){
        if(!status){
          atom.notifications.addError("Login was unsuccessful!");
          return;
        }
        let editor
        let submissionID;
        if (editor = atom.workspace.getActiveTextEditor()) {
          let code = editor.getText()
          let fileName = editor.getTitle()
          let problemName = fileName.split(".")[0]
          let solutionExtension = fileName.split(".")[1]
          let problemUrl = URLs.challengeBaseUrl+problemName+'/problem'
          let compileTestUrl = URLs.masterUrl + problemName + '/compile_tests'
          let requestJson = {
            'code': code,
            'language': LANG[solutionExtension],
            'customtestcase': false,
          }
          request({url: problemUrl, method: "GET"}, (e,r,b)=>{
             csrf = b.match(regexp)[1];
             let diffHeaders = {
               'x-csrf-token': csrf,
               'content-type':'application/json',
             }

             atom.notifications.addInfo('Submitting..');
             request({url: compileTestUrl, method: "POST", json: requestJson, headers: diffHeaders}, (err, res, body) => {
               if(e){
                 this.showError(e)
                 return
               }

               let submissionID = body['model']['id'];
               let infoUrl = compileTestUrl + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString()
               let repId = setInterval(()=>{
                 request({url: infoUrl, method: "GET", headers: diffHeaders}, (e,r,b) => {
                   if(e){
                     this.showError(e)
                     clearInterval(repId)
                     return
                   }

                   let resp = JSON.parse(b);
                   if(resp['model']['status'] != 0){
                     clearInterval(repId);
                     let msg = resp['model']['compilemessage'];
                     if(msg==""){
                       atom.notifications.addSuccess("Compile Successful");
                     }else{
                       atom.notifications.addError("Compile Unsuccessful", {'detail':msg});
                     }
                   }
                   infoUrl = compileTestUrl + '/' + submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString();
                 })
               },3000);
             });
           });
          }
        });
      }
    }
