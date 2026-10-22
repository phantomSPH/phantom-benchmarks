# Runtime options file for Phantom, written 10/09/2026 13:13:49.0
# Options not present assume their default values
# This file is updated automatically after a full dump

# job name
             logfile =  ceradiation01.log   ! file to which output is directed
            dumpfile =  ceradiation_00664   ! dump file to start from

# options controlling run time and input/output
                tmax =   8.000E+05    ! end time
               dtmax =        250.    ! time between dumps
                nmax =          10    ! maximum number of timesteps (0=just get derivs and stop)
                nout =          -1    ! write dumpfile every n dtmax (-ve=ignore)
            twallmax =      168:00    ! maximum wall time (hhh:mm, 000:00=ignore)
           nfulldump =           1    ! full dump every n dumps
            iverbose =           0    ! verboseness of log (-1=quiet 0=default 1=allsteps 2=debug 5=max)
           dtwallmax =      012:00    ! maximum wall time between dumps (hhh:mm, 000:00=ignore)

# options controlling accuracy
              C_cour =       0.300    ! Courant factor
             C_force =       0.250    ! dt_force factor
                tolv =   1.000E-02    ! tolerance on v iterations in timestepping
       tree_accuracy =       0.500    ! tree opening criterion (0.0-1.0)
               hfact =       1.200    ! h in units of particle spacing [h = hfact*n^(-1/3)]
                tolh =   1.000E-04    ! tolerance on h-n iterations
#          two_kernel =           F    ! use Wtilde for number density / h

# shock capturing
               alpha =       0.000    ! MINIMUM shock viscosity parameter
            alphamax =       1.000    ! MAXIMUM shock viscosity parameter
                beta =       2.000    ! non-linear shock viscosity parameter
              alphau =       0.000    ! shock conductivity parameter

# options controlling equation of state
                ieos =           2    ! eqn of state (1=isoth;2=adiab;3=locally iso;8=barotropic)
                  mu =     0.61821    ! mean molecular weight
        ipdv_heating =           1    ! heating from PdV work (0=off, 1=on)
      ishock_heating =           1    ! shock heating (0=off, 1=on)

# options controlling cooling
            icooling =           0    ! cooling function (0=off, 1=library (step), 2=library (force),3=Gammie, 4=ISM, 5,6=KI02, 7=powerlaw, 9=radiative approx)

# options controlling sink particles
     isink_potential =           0    ! sink potential (0=1/r,1=surf)
       icreate_sinks =           0    ! allow automatic sink particle creation
     h_soft_sinksink =       0.000    ! softening length between sink particles
               f_acc =       0.800    ! particles < f_acc*h_acc accreted without checks

# options relating to external forces
      iexternalforce =           0    ! 1=star,2=coro,3=bina,4=prdr,5=toru,6=toys,7=exte,8=spir,9=Lens,10=dens,11=Eins,

# options controlling physical viscosity
           irealvisc =           0    ! physical viscosity type (0=none,1=const,2=Shakura/Sunyaev)
          shearparam =       0.100    ! magnitude of shear viscosity (irealvisc=1) or alpha_SS (irealvisc=2)
            bulkvisc =       0.000    ! magnitude of bulk viscosity

# options for injecting/removing particles
               rkill =      -1.000    ! deactivate particles outside this radius (<0 is off)

# options for radiation
  implicit_radiation =           T    ! use implicit integration (Whitehouse, Bate & Monaghan 2005)
    gas-rad_exchange =           T    ! exchange energy between gas and radiation
        flux_limiter =           T    ! limit radiation flux
       iopacity_type =           1    ! opacity method (0=inf,1=mesa,2=constant,-1=preserve)
                   X =       0.687    ! hydrogen mass fraction for MESA opacity table
                   Z =      0.0142    ! metallicity for MESA opacity table
             tol_rad =   1.000E-06    ! tolerance on backwards Euler implicit solve of dxi/dt
          itsmax_rad =         250    ! max number of iterations for radiation implicit solve
             cv_type =           0    ! how to get cv and mean mol weight (0=constant,1=mesa)

# optional outputs
               curlv =           F    ! output curl v in dump files
           track_lum =           F    ! write du/dt to dump files (for a "lightcurve")
                  gw =           F    ! calculate gravitational wave strain
