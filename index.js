const express = require('express');
const lunr = require('lunr');
const fs = require('fs');
const async = require('async');
const path = require('path');
const { resolve } = require('path');
const app = express();
const port = process.env.PORT || 5000;

let idx;
let docSummary = [];

const tocRegex = /toctree\:\:/;
const pathRegex = /^\s+\/?(\w+\/)*\w+$/gm;
const dirRegex = /^\s*\/?((\w+\/)*)/gm;
const fileRegex = /\w+$/gm;
const captionRegex = /\:caption\:\s*([\w\s]*)/gm;
/**
 * 
 * @param {st} rootPath the root path set in tasks.json, doesn't change
 * @param {*} currentDir the current directory path
 * @param {*} entryFile the name of document file, file type(.rst) is excluded
 * @returns an object includes document content as well as sub document list
 */
const extractDocsInfo = ( rootPath, currentDir, entryFile ) => {
  return new Promise((resolve, reject) => {
    let filePath = path.join(rootPath, currentDir, entryFile + '.rst');
    fs.readFile(filePath, "utf-8", (err, content) => {
      if (err) {
        console.log(`Cannot read file ${filePath}`);
        reject(err);
      }
      console.log(`Reading file ${filePath}`);
      let paths = [];
      let contentArray = content.split('\n'); // convert file content into array

      // Find title
      let titleIndex = contentArray.findIndex((item) => /^[\=\-]+$/m.test(item));
      let title = '';
      console.log(`titleIndex: ${titleIndex}`);
      if (titleIndex > 0) {
        title = contentArray[titleIndex-1].replace('\r', '');
      }

      // Find the index of first '.. toctree::' as the beginning of toctree
      let tocTreeIndex = contentArray.findIndex((result) => tocRegex.test(result)); 
      console.log(`tocTreeIndex: ${tocTreeIndex}`);
      if (tocTreeIndex >= 0) {
        contentArray.splice(0, tocTreeIndex); // only keep content under toctree
      }

      let results = [];

      // Find caption
      let currentCaption = '';
      contentArray.forEach(item => {
        let obj = {
          caption: currentCaption,
          result: ''
        };
        let caption = captionRegex.exec(item);
        if (caption && caption[1]) {
          currentCaption = caption[1].replace('\r', '');
        }
        if (item.match(pathRegex) && item.trim().length !== 0) {
          obj.result = item;
          results.push(obj);
          console.log('pushed ', obj.result);
        }
      });

      console.log(`Find ${results.length} potential sub paths`);
      
      // extract info of sub docs
      if (results && results.length > 0 && tocTreeIndex != -1) {
        results.forEach(r => {
          const { caption, result } = r;
          let newDir = result.match(dirRegex);
          newDir = path.join(currentDir, newDir? newDir[0].trim(): '');

          let newFile = result.match(fileRegex);
          newFile = newFile? newFile[0].trim(): '';

          let fullPath = path.join(rootPath, newDir, newFile + '.rst');
          console.log(`result: ${result.trim()} PATH: ${newDir}${newFile} Fullpath: ${fullPath}`);

          if (fs.existsSync(fullPath)) { // check if sub doc exists
            console.log(`Valid`);
            paths.push({
              rootPath: rootPath,
              dir: newDir,
              entry: newFile,
              fullPath: fullPath,
              caption: caption
            });
          }
        })
      };
      console.log(`File has ${paths.length} subDocs`);
      console.log('');
      
      currentDir = currentDir.replace(/\\/g, '/');
      let docPath = `${currentDir}${entryFile}`;
      // if (filePath == 'docs\\pyats\\docs\\changelog\\2021\\march.rst') {
      //   console.log(`currentDir: ${currentDir} entryFile: ${entryFile}`);
      // }
      let info = {
        docPath: docPath,
        filePath: filePath,
        title: title,
        desc: content,
        subDocs: paths
      };
      resolve(info);
    })
  })
}

/**
 * 
 * @param {*} task the task object, each loop will create a new task object
 * @returns Promise
 */
const buildIndex = (task) => {
  let result = [];
  return new Promise((resolve, reject) => {
    extractDocsInfo(task.rootPath, task.currentDir? task.currentDir: '', task.entryFile).then((info) => {
      const {docPath, filePath, title, desc, subDocs} = info;

      let url = (task.rootUrl.trim() + docPath + '.html').replace('//', '/').replace('\\', '');

      result.push({
        topic: task.topic,
        caption: task.caption? task.caption: '',
        title: title,
        desc: desc,
        url: url,
        filePath: filePath
      });

      // Process sub documents
      if (subDocs && subDocs.length > 0) {
        async.eachSeries(subDocs, (subDoc, callback) => {
          const { dir, entry, caption } = subDoc;
          let subTask = {
            ...task,
            currentDir: dir,
            entryFile: entry,
            caption: caption? caption: task.caption? task.caption: ''
          };
          buildIndex(subTask).then(subResult => {
            result.push(...subResult);
            callback();
          }).catch(err => {
            console.log(err);
            callback(err);
          })
        }, (err) => {
          if (err) {
            reject(`Error ${err} happened while extract info from sub docs`);
          }
          resolve(result);
        })
      } else {
        resolve(result);
      }
    }).catch(err => {
      console.log(`Error ${err} happened while extract info from file ${task.rootPath} ${task.docPath}`);
      reject(`Error ${err} happened while extract info from file ${task.rootPath} ${task.docPath}`);
    })
  });
}

const buildJsonIndex = (task) => {
  let result = [];
  return new Promise((resolve, reject) => {
    const {topic, rootPath, targetFile} = task;
    if (!rootPath || !fs.existsSync(rootPath)) {
      reject(`Task ${topic} does not have root directory`)
    }
    fs.readdir(rootPath, (err, files) => {
      if (err) {
        reject(`Read root directory failed with error: ${err}`);
      }
      console.log(`Found ${files.length} files in root directory`);
      async.each(files, (file, callback) => {
        fs.readFile(file, 'utf-8', (err, data) => {
          if (err) {
            callback(err);
          }
          let dataList = [];
          try {
            dataList = JSON.parse(data);
          } catch (err) {
            console.log(`Parse file ${file} failed with error ${err}`);
            callback(err);
          }
          let keys = Object.keys(dataList);
          keys.forEach(key => {
            let data = dataList[key];
            let subKeys = Object.keys(data);
            let subOutput = subKeys.map(subKey => {
              return {
                ...data[subKey],
                topic: file,
                caption: key,
                title: subKey,
                desc: data[subKey].doc
              }
            });
            result.push(...subOutput)
          })
          callback();555555555555555555555555555555555555555555555555555555555555555555555555
        })
      }, (err) => {
        if (err) {
          reject(`Error ${err} happened while extract info from sub files`);
        }
        resolve(result);
      })
    })
  })
}

const refreshLunrIndex = (tasks) => {
  return new Promise((resolve, reject) => {
    docSummary = [];
    async.each(tasks, (task, callback) => {
      if (!fs.existsSync(task.targetFile)) {
        callback(`${task.topic} task index file is not existing`);
      }
      fs.readFile(task.targetFile, 'utf-8', (err, data) => {
        if (err) {
          callback(`${task.topic} task failed on read index file at ${task.targetFile}`);
        }
        try {
          docSummary.push(...JSON.parse(data));
          callback(null);
        } catch(err) {
          console.log(`Parse file failed with error ${err}`);
          callback(err);
        }
      })
    }, (err) => {
      if (err) {
        reject(`Refresh lunr index failed for error: ${err}`);
      }
      docSummary = docSummary.map((doc, index) => {
        return {
          ...doc,
          id: index
        } 
      })
      fs.writeFile('lunrIndex.json', JSON.stringify(docSummary, null, 2), 'utf-8', (err) => {
        if (err) {
          reject(`Create document index summary file failed for error: ${err}`);
        }
        idx = lunr(function() {
          this.ref('id');
          this.field('topic');
          this.field('caption');
          this.field('title');
          this.field('desc');
          this.metadataWhitelist = ['position'];
  
          docSummary.forEach((doc) => {
            this.add(doc);
          })
        });
        console.log(`Refresh lunr index done`);
        resolve(`Refresh lunr index done`);
      })
    })
  })
}

const createSearchResult = (terms) => {
  let result = idx.search(terms);
  filledResult = result.map(data => {
    let ref = data.ref;
    const {topic, caption, title, desc, url} = docSummary[ref];
    return {
      ...data,
      url: url,
      topic: topic,
      caption: caption,
      title: title,
      description: desc
    }
  });
  console.log(`${filledResult.length} results got from search on terms ${terms}`);
  return filledResult;
}

// console.log that your server is up and running
app.listen(port, () => console.log(`Listening on port ${port}`));

// Add headers
app.use(function (req, res, next) {

  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');

  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader('Access-Control-Allow-Credentials', true);

  // Pass to next layer of middleware
  next();
});

app.use(express.static('client/build'));

app.get('/_build', (req, res) => {
  fs.readFile('tasks.json', 'utf-8', (err, content) => {
    if (err) {
      console.log(`Read tasks.json file failed for error ${err}`);
      res.status(500).send({result: err});
    }
    let tasks;
    try {
      tasks = JSON.parse(content);
    } catch (err) {
      console.log(`Parse file failed with error ${err}`);
      callback(err);
    }
    if (req.query && req.query.tasks) {
      let queriedTasks = req.query.tasks.split(',').map(task => task.trim());
      tasks = tasks.filter(task => queriedTasks.indexOf(task.topic) >= 0);
    }
    console.log(`build index for tasks ${JSON.stringify(tasks)}`);

    async.each(tasks, (task, callback) => {
      if (task.type == 'rst') {
        buildIndex(task).then(data => {
          fs.writeFile(task.targetFile, JSON.stringify(data, null, 2), (err) => {
            if (err) {
              callback(err);
            }
            callback();
          })
        }).catch(err => {
          console.log(err);
          callback(err);
        })
      } else {
        buildJsonIndex(task).then(data => {
          fs.writeFile(task.targetFile, JSON.stringify(data, null, 2), (err) => {
            if (err) {
              callback(err);
            }
            callback();
          })
        }).catch(err => {
          console.log(err);
          callback(err);
        })
      }
    }, (err) => {
      console.log(`Build Index is done`);
      if (err) {
        res.status(500).send({result: err});
      }
      res.send({result: tasks});
    })
  })
});

app.get('/_refresh', (req, res) => {
  fs.readFile('tasks.json', 'utf-8', (err, content) => {
    if (err) {
      console.log(`Read tasks.json file failed for error ${err}`);
      res.status(500).send({result: err});
    }
    let tasks;
    try {
      tasks = JSON.parse(content);
    } catch (err) {
      console.log(`Parse file failed with error ${err}`);
      callback(err);
    }
    
    refreshLunrIndex(tasks).then((result) => {
      res.send({result: result});
    }).catch(err => {
      res.send({result: err});
    })
  })
})

app.get('/_search', (req, res) => {
  console.log(`_search query: ${req.query.terms}`);
  if (!idx) {
    fs.readFile('tasks.json', 'utf-8', (err, content) => {
      if (err) {
        console.log(`Read tasks.json file failed for error ${err}`);
        res.status(500).send({result: err});
      }

      let tasks;
      try {
        tasks = JSON.parse(content);
      } catch (err) {
        console.log(`Parse file failed with error ${err}`);
        callback(err);
      }

      refreshLunrIndex(tasks).then(() => {
        let result = createSearchResult(req.query.terms);
        res.send({result: result});
      }).catch(err => { 
        res.send({result: err});
      })
    })
  } else {
    let result = createSearchResult(req.query.terms);
    res.send({result: result});
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'client/build', 'index.html'));
})