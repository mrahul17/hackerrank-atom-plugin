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
  'masterUrl': 'https://www.hackerrank.com/rest/contests/',
  'challengeBaseUrl': 'https://www.hackerrank.com/challenges/',
  'contestBaseUrl': 'https://www.hackerrank.com/contests/'
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
        resolve();
        return;
      }
      if(!this.checkRequirements()){
        atom.notifications.addError('Login credentials not found', {'detail':
        'Please input credentials(hr_username and hr_password) in environment or hardcode in this file(auth).'})
        reject()
        return;
      }
      let auth = {
        'login': process.env.hr_username,
        'password': process.env.hr_password,
        'remember_me': 'false',
        'fallback': 'true'
      }
      atom.notifications.addInfo("Logging you in ..")
      request({url: 'https://www.hackerrank.com/login', method: "GET"}, (e,r,b)=>{
        if(e){
          this.showError(e)
          reject()
          return
        }

        let csrf = b.match(regexp)[1];
        let diffHeaders = {
          'x-csrf-token': csrf,
          'content-type':'application/x-www-form-urlencoded',
        }

        request({url: URLs.loginUrl, method: "POST", formData: auth, headers: diffHeaders}, (e,r,b)=>{
          let status = JSON.parse(b)['status']
          if(status){
            atom.notifications.addSuccess("Login Successful")
            loggedInStatus = true;
            resolve()
          }else {
            atom.notifications.addError("Login Unsuccessful", {'detail':e})
            reject()
          }
        });
      });
    });
  },
get_submission_details(){
  let editor
  if (editor = atom.workspace.getActiveTextEditor()) {
    let code = editor.getText()
    let fileNameParts = editor.getTitle().split(".")
    let contestName = 'master'
    let problemName = ''
    let solutionExtension = ''
    if(fileNameParts.length==3){
      contestName = fileNameParts[0]
      problemName = fileNameParts[1]
      solutionExtension = fileNameParts[2]
    }
    else{
      problemName = fileNameParts[0]
      solutionExtension = fileNameParts[1]
    }
    return {
      'contestName': contestName,
      'problemName': problemName,
      'solutionExtension': solutionExtension,
      'code': code
    }
  }else {
    return false;
  }
},
make_submission(details){
  let problemUrl = URLs.contestBaseUrl + details.contestName + '/' + 'challenges/' + details.problemName
  let submissionUrl = ''
  if(details.submission_type==0)
    submissionUrl = URLs.masterUrl + details.contestName + '/' + 'challenges/' + details.problemName + '/compile_tests'
  else
    submissionUrl = URLs.masterUrl + details.contestName + '/' + 'challenges/' + details.problemName + '/submissions'

  let problemDetailUrl = URLs.masterUrl + details.contestName + '/challenges/' + details.problemName
  return new Promise((resolve, reject)=> {
    request({url: problemUrl, method: "GET"}, (e,r,b)=>{
      if(e){
        reject(e)
        return
      }
      csrf = b.match(regexp)[1];

      let problemMaxScore = 0
      request({url: problemDetailUrl, method: "GET"}, (e,r,b)=>{
        if(e){
          reject(e)
          return
        }
        problemMaxScore = JSON.parse(b)['model']['max_score']
        let diffHeaders = {
          'x-csrf-token': csrf,
          'content-type':'application/json',
        }
        atom.notifications.addInfo('Submitting..');
        request({url: submissionUrl, method: "POST", json: details.requestJson, headers: diffHeaders}, (e,r,b) => {
          if(e){
            reject(e)
            return
          }
          let submissionID = b['model']['id'];
          a = {'submissionID':  submissionID,'submissionUrl': submissionUrl,
          'submission_type': details.submission_type, 'max_score': problemMaxScore}
          resolve(a)
        });
      })
    });
  });
},

get_submission_status(details){
  let diffHeaders = {
    'x-csrf-token': csrf,
    'content-type':'application/json',
  }
  let infoUrl = details.submissionUrl + '/' + details.submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString()

  return new Promise((resolve, reject)=> {

    let repId = setInterval(()=>{
      request({url: infoUrl, method: "GET", headers: diffHeaders}, (e,r,b) => {
        if(e){
          clearInterval(repId)
          reject(e)
          return
        }
        let resp = JSON.parse(b);

        if(details.submission_type==0){
          if(resp['model']['status'] != 0){
            clearInterval(repId);
            let msg = resp['model']['compilemessage'];
            let testcaseMessage = resp['model']['testcase_message'][0]
            if(msg==""){
              if (testcaseMessage == "Wrong Answer") {
                msg2 = 'Input: \n'+resp['model']['stdin'] + '\n'
                msg2 += 'Your Output: \n'+resp['model']['stdout'] + '\n'
                msg2 += 'Expected Output: \n'+resp['model']['expected_output']
                atom.notifications.addError("Sample Tests Failed.",{'detail':msg2})
              }
              else if (["Segmentation", "Terminated"].includes(testcaseMessage.split(" ")[0])) {
                atom.notifications.addError("Compilation Failed.",{'detail':testcaseMessage})
              }
              else {
                atom.notifications.addSuccess("Compile Successful");
              }

            }else{
              atom.notifications.addError("Compile Unsuccessful", {'detail':msg});
            }
            resolve()
          }
        }else {
          let msg = resp['model']['status'];
          let displayScore = resp['model']['display_score']
          if(msg=='Accepted'){
            clearInterval(repId)
            atom.notifications.addSuccess("Submission Successful",{'detail': msg});
            resolve();
          }

          else if(['Wrong','Compilation','Codechecker', 'Segmentation', 'Runtime', 'Terminated'].includes(msg.split(" ")[0])){
            clearInterval(repId);
            let msg3 = "Your Score: "+ displayScore
            msg3 +=  "\nMax Score: " + details.max_score + '\n'
            msg3 += msg
            atom.notifications.addError("Submission Unsuccessful",{'detail': msg3});
            resolve()
          }

        }
       infoUrl = details.submissionUrl + '/' + details.submissionID.toString() + '?_=' + ((new Date() / 1000) * 1000).toString();
      })
    },2000);
  });
},
  compile(){
    this.login().then(()=> {
        let details = this.get_submission_details()
        if(details){
          let requestJson = {
            'code': details.code,
            'language': LANG[details.solutionExtension],
            'customtestcase': false,
          }
          details['requestJson'] = requestJson;
          details['submission_type'] = 0;
          this.make_submission(details).then((details)=>{
            this.get_submission_status(details)
          }).catch(reason=>{
            this.showError(reason)
          })
        }
    }).catch(error=>{
    });
  },
  submit() {
    this.login().then(()=> {
        let details = this.get_submission_details()
        if(details){
          let requestJson = {
            'code' : details.code,
            'contest_slug' : details.contestName,
            'language': LANG[details.solutionExtension],
          }
          details['requestJson'] = requestJson;
          details['submission_type'] = 1;
          this.make_submission(details).then((details)=>{
            this.get_submission_status(details)
          }).catch(reason=>{
            this.showError(reason)
          })
        }

    }).catch(error=>{
    });
  },
}
