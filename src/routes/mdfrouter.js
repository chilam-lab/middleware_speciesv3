
/**
 * Express router que monta las funciones requeridas para el frontend de species v1
 * @type {object}
 * @const
 * @namespace mdfRouter
 */
var router = require('express').Router()
var mdfCtrl = require('../controllers/mdf_controller')

router.all('/', function(req, res) {
  res.json({ 
    data: { 
      message: '¡Yey! Bienvenido al API para el FrontEnd de SPECIES'
    }
  })
})

router.route('/sources')
  .get(mdfCtrl.get_sources)
  .post(mdfCtrl.get_sources)


router.route('/getVariables')
  .get(mdfCtrl.get_variables)
  .post(mdfCtrl.get_variables)

router.route('/getCatArea')
  .get(mdfCtrl.getCatArea)
  .post(mdfCtrl.getCatArea)


router.route('/getTaxonList')
  .get(mdfCtrl.getTaxonList)
  .post(mdfCtrl.getTaxonList)

router.route('/getTaxonFromString')
  .get(mdfCtrl.getTaxonFromString)
  .post(mdfCtrl.getTaxonFromString)


router.route('/getOccMapaAnalisisNicho')
  .get(mdfCtrl.getOccMapaAnalisisNicho)
  .post(mdfCtrl.getOccMapaAnalisisNicho)
  


router.route('/getTaxonChildren')
  .get(mdfCtrl.getTaxonChildren)
  .post(mdfCtrl.getTaxonChildren)


router.route('/getOccOnMap')
  .get(mdfCtrl.getOccOnMap)
  .post(mdfCtrl.getOccOnMap)


router.route('/getGeoJsonbyGridid')
  .get(mdfCtrl.getGeoJsonbyGridid)
  .post(mdfCtrl.getGeoJsonbyGridid)


router.route('/getEpsScrRelation')
  .get(mdfCtrl.get_EpsScrRelation)
  .post(mdfCtrl.get_EpsScrRelation)


router.route('/getFrequencyByRange')
  .get(mdfCtrl.get_freq_byrange)
  .post(mdfCtrl.get_freq_byrange)


router.route('/getEpsScrByCell')
  .get(mdfCtrl.get_EpsScr_bycell)
  .post(mdfCtrl.get_EpsScr_bycell)




module.exports = router;