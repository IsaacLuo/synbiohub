// This file manages the rendering of the createImplementation form, its form validation, Implementation creation, and finally submission


var loadTemplate = require('../loadTemplate')
var implementation = require('../views/implementation')
var config = require('../config')
var pug = require('pug')
var getUrisFromReq = require('../getUrisFromReq')
var sparql = require('../sparql/sparql')
var SBOLDocument = require('sboljs')
var extend = require('xtend')

const multiparty = require('multiparty')
const uriToUrl = require('../uriToUrl')
const attachments = require('../attachments')
const uploads = require('../uploads')
const fs = require('mz/fs')
const db = require('../db')

module.exports = function(req, res) {

    const { graphUri, uri, designId, baseUri, url } = getUrisFromReq(req, res)

    if (req.method === 'POST'){

      submitPost(req, res)
    }

    else{

      submitForm(req, res, {}, {})

    }

}


async function submitForm(req, res, submissionData, locals){

    const { graphUri, uri, designId, baseUri, url } = getUrisFromReq(req, res)

    req.setTimeout(0) // no timeout
    plan_list = []

    submissionData = extend({
        createdBy: req.user,
    }, submissionData)

    var locals = extend({
      config: config.get(),
      user: req.user,
      errors: [],
      submission: submissionData,
      canEdit: true,
    }, locals)

    plan_query = "PREFIX prov: <http://www.w3.org/ns/prov#> SELECT ?s WHERE { ?s a prov:Plan .}"

    let plans = await sparql.queryJson(plan_query, graphUri)


    for (plan of plans){
      plan_list.push(plan['s'].split('/').pop())
    }


    console.log(plan_list)

    let users = await db.model.User.findAll()


    locals = extend({
      agents: users
    }, locals)


    res.send(pug.renderFile('templates/views/createImplementation.jade', locals))

}

function submitPost(req, res){

  const { graphUri, uri, designId, baseUri, url } = getUrisFromReq(req, res)

  req.setTimeout(0) // no timeout

  const form = new multiparty.Form()

  form.on('error', (err) => {
      res.status(500).send(err)
  })

  form.parse(req, (err, fields, files) => {

    const { graphUri, uri, designId, baseUri, url } = getUrisFromReq(req, res)

    var errors = []

    const submissionData = {
        design_name: fields['design_name'][0],
        plan: fields['plan'][0],
        agent: fields['agent'][0],
        description: fields['description'][0],
        location: fields['location'][0]

    }

    console.log(fields)

    if (fields['design_name'][0] === ''){

        errors.push('Please give the built design a name.')

    }

    if (fields['plan'][0] === ''){

        errors.push('Please mention which protocol was used in the lab.')

    }

    if (fields['agent'][0] === ''){

      errors.push('Please mention who built the design.')

    }

    if (fields['description'][0] === ''){

        errors.push('Please mention the purpose of this built design.')

    }

    if (fields['location'][0] === ''){

        errors.push('Please mention where the built design is stored.')

    }

    if (files['file'][0]['size'] === 0){

        errors.push('Please upload a file describing the lab protocol.')

    }

    prefix = baseUri
    displayId = fields['design_name'][0].replace(/\s+/g, '')
    version = '1'

    var templateParams = {
       uri: prefix + '/' + displayId + '/' + version

    }

    var countQuery = "PREFIX sbol2: <http://sbols.org/v2#> SELECT * WHERE { <" + templateParams['uri'] + "> a sbol2:Implementation}"

    sparql.queryJson(countQuery, graphUri).then((count) => {

      count = JSON.parse(JSON.stringify(count))

      if (count!=0){
        errors.push('A built design with this name already exists.')

      }

      if (errors.length > 0) {
          if (req.forceNoHTML || !req.accepts('text/html')) {
              res.status(500).type('text/plain').send(errors)
              return
          } else {
              return submitForm(req, res, submissionData, {
                  errors: errors
              })
          }
      }

      else{

        let fileStream = fs.createReadStream(files['file'][0]['path']);

        return uploads.createUpload(fileStream).then((uploadInfo) => {

          const { hash, size, mime } = uploadInfo

          return attachments.addAttachmentToTopLevel(graphUri, baseUri, prefix + '/' + fields['plan'][0].replace(/\s+/g, ''),
          files['file'][0]['originalFilename'], hash, size, mime,
          graphUri.split('/').pop)
        }).then(() => {

          doc= new SBOLDocument();
          var document = doc

          asc = doc.provAssociation(prefix + '/' + displayId + '_association/' + version)
          asc.displayId = displayId + '_association'
          asc.persistentIdentity = prefix + '/' + asc.displayId
          asc.version = version
          asc.addRole('http://sbols.org/v2#build')


          agent_str = fields['agent'][0]
          agent_uri = graphUri
          plan_str = fields['plan'][0]
          plan_uri = prefix + '/' + plan_str.replace(/\s+/g, '')

          agent = doc.provAgent(graphUri)
          agent.displayId = agent_str
          agent.name = agent_str
          agent.persistentIdentity = graphUri

          plan = doc.provPlan(plan_uri)
          plan.displayId = plan_str.replace(/\s+/g, '')
          plan.name = plan_str
          plan.persistentIdentity = prefix + '/' + plan.displayId.replace(/\s+/g, '')

          agent.addUriAnnotation('http://wiki.synbiohub.org/wiki/Terms/synbiohub#topLevel', agent.uri)
          plan.addUriAnnotation('http://wiki.synbiohub.org/wiki/Terms/synbiohub#topLevel', plan.uri)

          asc.agent = agent_uri
          asc.plan = plan_uri

          act = doc.provActivity(prefix + '/' + displayId + '_activity/' + version)
          act.displayId = displayId + '_activity'
          act.persistentIdentity = prefix + '/' + act.displayId
          act.version = version

          act.addUriAnnotation('http://wiki.synbiohub.org/wiki/Terms/synbiohub#topLevel', act.uri)
          act.addAssociation(asc)

          usg = doc.provUsage(prefix + '/' + displayId + '_usage/' + version)
          usg.displayId = displayId + '_usage'
          usg.persistentIdentity = prefix + '/' + usg.displayId
          usg.version = version
          usg.entity = uri

          usg.addRole('http://sbols.org/v2#design')
          act.addUsage(usg)

          impl = doc.implementation(prefix + '/' + displayId + '/' + version)
          impl.displayId = displayId
          impl.persistentIdentity = prefix + '/' + impl.displayId
          impl.version = version
          impl.description = fields['description'][0]
          impl.built = prefix + '/' + displayId + '/' + version

          impl.addStringAnnotation('http://wiki.synbiohub.org/wiki/Terms/synbiohub#physicalLocation', fields['location'][0])
          impl.addWasGeneratedBy(act.uri)
          impl.wasDerivedFrom = uri
          impl.addStringAnnotation('http://wiki.synbiohub.org/wiki/Terms/synbiohub#ownedBy', graphUri)
          impl.addUriAnnotation('http://wiki.synbiohub.org/wiki/Terms/synbiohub#topLevel', impl.uri)

          console.log(doc.serializeXML())

          sparql.upload(graphUri, doc.serializeXML(), 'application/rdf+xml').then( () => {

            res.redirect(impl.uri)

          })


        })
      }




    })


  })
}
